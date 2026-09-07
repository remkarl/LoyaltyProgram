import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT ?? 8787)
const dataPath = process.env.KODOKODO_DATA_PATH ?? join(dirname(fileURLToPath(import.meta.url)), 'data.json')
const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
const sessions = new Map()

const rewards = [
  { name: 'Premium banchan upgrade', points: 300, status: 'Ready', requiredTier: 'Bronze' },
  { name: 'Gyeran-jjim add-on', points: 420, status: 'Available', requiredTier: 'Bronze' },
  { name: 'Free Hite / Cass', points: 180, status: 'Popular', requiredTier: 'Bronze' },
  { name: 'Secret menu tasting', points: 650, status: 'VIP', requiredTier: 'Gold' },
]

const tierRank = { Bronze: 0, Silver: 1, Gold: 2 }

const getTier = (points) => points >= 1000 ? 'Gold' : points >= 500 ? 'Silver' : 'Bronze'

const readStore = () => {
  if (!existsSync(dataPath)) return null
  return JSON.parse(readFileSync(dataPath, 'utf8'))
}

const writeStore = (store) => {
  mkdirSync(dirname(dataPath), { recursive: true })
  writeFileSync(dataPath, JSON.stringify(store, null, 2))
}

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const verifyPassword = (password, storedHash) => {
  const [salt, expectedHash] = storedHash.split(':')
  if (!salt || !expectedHash) return false
  const actualHash = scryptSync(password, salt, 64)
  const expectedBuffer = Buffer.from(expectedHash, 'hex')
  return expectedBuffer.length === actualHash.length && timingSafeEqual(actualHash, expectedBuffer)
}

const seedStore = () => ({
  users: [
    { id: 'USR-STAFF-1', email: 'manager@kodokodo.ph', role: 'staff', passwordHash: hashPassword('kodokodo123') },
    { id: 'USR-MEMBER-1', email: 'yuna@kodokodo.ph', role: 'member', memberId: 'KD-2048', passwordHash: hashPassword('kodokodo123') },
  ],
  members: [
    { memberId: 'KD-2048', name: 'Yuna Park', mobile: '+63 917 890 2241', email: 'yuna@kodokodo.ph', tier: 'Gold', lastVisit: 'Today', points: 2480, visits: 18 },
    { memberId: 'KD-1186', name: 'Jay Araneta', mobile: '+63 917 555 1186', email: 'jay@kodokodo.ph', tier: 'Silver', lastVisit: '2 days ago', points: 860, visits: 11 },
    { memberId: 'KD-0932', name: 'Mina Sol', mobile: '+63 917 555 0932', email: 'mina@kodokodo.ph', tier: 'Bronze', lastVisit: '5 days ago', points: 320, visits: 6 },
  ],
  activities: [],
})

const getStore = () => {
  const store = readStore() ?? seedStore()
  writeStore(store)
  return store
}

const json = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

const readBody = async (request) => {
  let body = ''
  for await (const chunk of request) body += chunk
  return body ? JSON.parse(body) : {}
}

const authUser = (request, store) => {
  const token = request.headers.authorization?.replace('Bearer ', '')
  const session = token ? sessions.get(token) : null
  return session ? store.users.find((user) => user.id === session.userId) : null
}

const publicMember = (member) => {
  const safeMember = { ...member }
  delete safeMember.email
  delete safeMember.mobile
  return safeMember
}

const makeActivity = (memberId, type, fields) => ({
  memberId,
  type,
  transactionId: `TX-${Date.now()}-${randomBytes(3).toString('hex')}`,
  date: new Date().toISOString(),
  ...fields,
})

const createApp = () => createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return json(response, 204, {})

  const store = getStore()
  const url = new URL(request.url, `http://${request.headers.host}`)

  if (request.method === 'GET' && url.pathname === '/api/health') return json(response, 200, { ok: true })

  try {
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password, role } = await readBody(request)
      const user = store.users.find((item) => item.email === String(email).trim().toLowerCase() && item.role === role)
      if (!user || !verifyPassword(password, user.passwordHash)) return json(response, 401, { error: 'Invalid credentials' })
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { userId: user.id })
      return json(response, 200, { token, role: user.role, memberId: user.memberId ?? null })
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/signup') {
      const { fullName, mobile, email, password } = await readBody(request)
      const normalizedEmail = String(email).trim().toLowerCase()
      const normalizedMobile = String(mobile).trim().replace(/\s/g, '')
      if (!fullName?.trim() || !normalizedEmail || !normalizedMobile || String(password).length < 8) return json(response, 400, { error: 'Complete all required fields' })
      if (store.members.some((member) => member.email.toLowerCase() === normalizedEmail || member.mobile.replace(/\s/g, '') === normalizedMobile)) return json(response, 409, { error: 'A member already uses that email or mobile' })

      const memberId = `KD-${String(Date.now()).slice(-4)}`
      const member = { memberId, name: fullName.trim(), mobile: mobile.trim(), email: normalizedEmail, tier: 'Bronze', lastVisit: 'New member', points: 0, visits: 0 }
      const user = { id: `USR-${randomBytes(5).toString('hex')}`, email: normalizedEmail, role: 'member', memberId, passwordHash: hashPassword(password) }
      store.members.unshift(member)
      store.users.push(user)
      store.activities.unshift(makeActivity(memberId, 'signup', { action: 'Member registered', detail: member.name, amount: 'Bronze' }))
      writeStore(store)
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { userId: user.id })
      return json(response, 201, { token, role: user.role, memberId })
    }

    const user = authUser(request, store)
    if (!user) return json(response, 401, { error: 'Authentication required' })

    if (request.method === 'GET' && url.pathname === '/api/me') {
      const member = user.memberId ? store.members.find((item) => item.memberId === user.memberId) : null
      return json(response, 200, { role: user.role, member: member ? publicMember(member) : null })
    }

    if (request.method === 'GET' && url.pathname === '/api/members') {
      if (user.role !== 'staff') return json(response, 403, { error: 'Staff access required' })
      return json(response, 200, { members: store.members.map(publicMember) })
    }

    if (request.method === 'GET' && url.pathname === '/api/activity') {
      const activities = user.role === 'staff' ? store.activities : store.activities.filter((activity) => activity.memberId === user.memberId)
      return json(response, 200, { activities })
    }

    if (request.method === 'POST' && url.pathname === '/api/earn') {
      if (user.role !== 'staff') return json(response, 403, { error: 'Staff access required' })
      const { memberId, receiptNo, purchaseAmount, serviceType } = await readBody(request)
      const member = store.members.find((item) => item.memberId === memberId)
      const amount = Number(purchaseAmount)
      if (!member) return json(response, 404, { error: 'Member not found' })
      if (!receiptNo?.trim() || !Number.isFinite(amount) || amount <= 0) return json(response, 400, { error: 'Valid receipt and purchase amount required' })
      if (store.activities.some((activity) => activity.type === 'earn' && activity.receiptNo?.toLowerCase() === receiptNo.trim().toLowerCase())) return json(response, 409, { error: 'Receipt already processed' })

      const points = Math.floor(amount / 100)
      const pointsBefore = member.points
      member.points += points
      member.visits += 1
      member.tier = getTier(member.points)
      member.lastVisit = 'Today'
      store.activities.unshift(makeActivity(memberId, 'earn', { receiptNo: receiptNo.trim(), pointsBefore, pointsChange: points, pointsAfter: member.points, action: 'Points earned', detail: `${serviceType} receipt ${receiptNo.trim()}`, amount: `+${points} pts` }))
      writeStore(store)
      return json(response, 200, { member: publicMember(member), points })
    }

    if (request.method === 'POST' && url.pathname === '/api/redeem') {
      if (user.role !== 'staff') return json(response, 403, { error: 'Staff access required' })
      const { memberId, reward } = await readBody(request)
      const member = store.members.find((item) => item.memberId === memberId)
      const selectedReward = rewards.find((item) => item.name === reward)
      if (!member || !selectedReward) return json(response, 400, { error: 'Valid member and reward required' })
      if (tierRank[member.tier] < tierRank[selectedReward.requiredTier] || member.points < selectedReward.points) return json(response, 409, { error: 'Member is not eligible for this reward' })

      const pointsBefore = member.points
      member.points -= selectedReward.points
      member.tier = getTier(member.points)
      member.lastVisit = 'Today'
      store.activities.unshift(makeActivity(memberId, 'redeem', { pointsBefore, pointsChange: -selectedReward.points, pointsAfter: member.points, action: 'Reward redeemed', detail: selectedReward.name, amount: `-${selectedReward.points} pts` }))
      writeStore(store)
      return json(response, 200, { member: publicMember(member), reward: selectedReward })
    }

    return json(response, 404, { error: 'Route not found' })
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : 'Request failed' })
  }
})

export { createApp, getStore, hashPassword, verifyPassword }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createApp().listen(port, () => console.log(`Kodokodo API listening on http://localhost:${port}`))
}
