export const getTierStatus = (points) => {
  if (points >= 1000) return { name: 'Gold', title: 'VIP', next: 'Max tier', pointsToNext: 0, progress: 100 }
  if (points >= 500) return { name: 'Silver', title: 'Captain', next: 'Gold', pointsToNext: 1000 - points, progress: ((points - 500) / 500) * 100 }
  return { name: 'Bronze', title: 'Friend', next: 'Silver', pointsToNext: 500 - points, progress: (points / 500) * 100 }
}

export const normalizeMembers = (members) => members.map((member, index) => ({
  ...member,
  memberId: member.memberId ?? (member.name === 'Yuna Park' ? 'KD-2048' : `KD-${String(index + 1).padStart(4, '0')}`),
  mobile: member.mobile ?? '',
  email: member.email ?? '',
  tier: getTierStatus(member.points ?? 0).name,
  visits: member.visits ?? (member.name === 'Yuna Park' ? 18 : 0),
}))

export const normalizeActivityLog = (activities) => activities.map((activity) => ({
  ...activity,
  memberId: activity.memberId ?? null,
}))

export const filterActivityForMember = (activities, memberId) => (
  activities.filter((activity) => activity.memberId === memberId)
)

export const parsePurchaseAmount = (value) => {
  const normalizedValue = String(value ?? '').trim().replace(/[₱,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) return null

  const amount = Number(normalizedValue)
  return Number.isFinite(amount) ? amount : null
}

export const hasProcessedReceipt = (activities, receiptNo) => {
  const normalizedReceipt = receiptNo.trim().toLowerCase()
  return activities.some((activity) => activity.type === 'earn' && activity.receiptNo?.toLowerCase() === normalizedReceipt)
}

export const getVisibleNavItems = (role, items) => (
  role === 'member' ? items.filter((item) => ['Overview', 'Rewards'].includes(item.label)) : items
)

export const canAccessView = (role, view) => role === 'staff' || ['Overview', 'Rewards'].includes(view)

export const calculateEarnedPoints = (purchaseAmount) => Math.floor(purchaseAmount / 100)

export const canRedeem = (memberPoints, rewardCost) => rewardCost > 0 && rewardCost <= memberPoints

const tierRank = { Bronze: 0, Silver: 1, Gold: 2 }

export const canRedeemReward = (member, reward) => (
  Boolean(member && reward)
  && canRedeem(member.points, reward.points)
  && tierRank[member.tier] >= tierRank[reward.requiredTier ?? 'Bronze']
  && reward.status !== 'Expired'
)

export const escapeCsvCell = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const toCsv = (rows) => rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
