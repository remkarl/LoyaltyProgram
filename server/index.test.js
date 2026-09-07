import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const serverPath = join(rootDirectory, 'server', 'index.js')
const dataDirectory = mkdtempSync(join(tmpdir(), 'kodokodo-api-'))
const dataPath = join(dataDirectory, 'data.json')
const port = 8790 + Math.floor(Math.random() * 100)
const baseUrl = `http://127.0.0.1:${port}`
let serverProcess

const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
  ...options,
  headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
})

const waitForServer = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
  throw new Error('Backend server did not start')
}

before(async () => {
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: rootDirectory,
    env: { ...process.env, PORT: String(port), KODOKODO_DATA_PATH: dataPath },
    stdio: 'ignore',
  })
  await waitForServer()
})

after(() => {
  serverProcess?.kill()
  rmSync(dataDirectory, { recursive: true, force: true })
})

test('backend enforces roles, duplicate receipts, and reward eligibility', async () => {
  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'manager@kodokodo.ph', password: 'kodokodo123', role: 'staff' }),
  })
  const { token } = await loginResponse.json()
  assert.equal(loginResponse.status, 200)

  const membersResponse = await request('/api/members', { headers: { Authorization: `Bearer ${token}` } })
  const membersPayload = await membersResponse.json()
  assert.equal(membersResponse.status, 200)
  assert.ok(membersPayload.members.some((member) => member.memberId === 'KD-2048'))

  const earnResponse = await request('/api/earn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId: 'KD-2048', receiptNo: 'TEST-100', purchaseAmount: 1440, serviceType: 'Dinner' }),
  })
  const earnPayload = await earnResponse.json()
  assert.equal(earnResponse.status, 200)
  assert.equal(earnPayload.points, 14)

  const duplicateResponse = await request('/api/earn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId: 'KD-2048', receiptNo: 'test-100', purchaseAmount: 1440, serviceType: 'Dinner' }),
  })
  assert.equal(duplicateResponse.status, 409)

  const restrictedRewardResponse = await request('/api/redeem', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId: 'KD-0932', reward: 'Secret menu tasting' }),
  })
  assert.equal(restrictedRewardResponse.status, 409)
})

test('member token cannot access staff member directory', async () => {
  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'yuna@kodokodo.ph', password: 'kodokodo123', role: 'member' }),
  })
  const { token } = await loginResponse.json()
  const membersResponse = await request('/api/members', { headers: { Authorization: `Bearer ${token}` } })

  assert.equal(loginResponse.status, 200)
  assert.equal(membersResponse.status, 403)
})
