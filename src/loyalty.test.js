import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateEarnedPoints,
  canAccessView,
  canRedeemReward,
  canRedeem,
  filterActivityForMember,
  getTierStatus,
  getVisibleNavItems,
  hasProcessedReceipt,
  normalizeActivityLog,
  normalizeMembers,
  parsePurchaseAmount,
  toCsv,
} from './loyalty.js'

test('tier status follows loyalty thresholds', () => {
  assert.equal(getTierStatus(499).name, 'Bronze')
  assert.equal(getTierStatus(500).name, 'Silver')
  assert.equal(getTierStatus(1000).name, 'Gold')
  assert.equal(getTierStatus(2480).progress, 100)
})

test('legacy members receive stable IDs, tiers, contacts, and visits', () => {
  const [member] = normalizeMembers([{ name: 'Yuna Park', points: 2480 }])

  assert.deepEqual(member, {
    name: 'Yuna Park',
    points: 2480,
    memberId: 'KD-2048',
    mobile: '',
    email: '',
    tier: 'Gold',
    visits: 18,
  })
})

test('member activity is isolated by member ID', () => {
  const activities = normalizeActivityLog([
    { memberId: 'KD-2048', action: 'Points earned' },
    { memberId: 'KD-1186', action: 'Reward redeemed' },
    { action: 'Legacy activity' },
  ])

  assert.deepEqual(filterActivityForMember(activities, 'KD-2048'), [activities[0]])
  assert.deepEqual(filterActivityForMember(activities, 'KD-1186'), [activities[1]])
})

test('receipt IDs prevent duplicate point awards', () => {
  const activities = [{ type: 'earn', receiptNo: 'RCP-4812', memberId: 'KD-2048' }]

  assert.equal(hasProcessedReceipt(activities, ' rcp-4812 '), true)
  assert.equal(hasProcessedReceipt(activities, 'RCP-9999'), false)
})

test('member permissions expose only personal views', () => {
  const items = [
    { label: 'Overview' },
    { label: 'Members' },
    { label: 'Forms' },
    { label: 'Rewards' },
  ]

  assert.deepEqual(getVisibleNavItems('member', items).map((item) => item.label), ['Overview', 'Rewards'])
  assert.deepEqual(getVisibleNavItems('staff', items), items)
  assert.equal(canAccessView('member', 'Forms'), false)
  assert.equal(canAccessView('member', 'Rewards'), true)
  assert.equal(canAccessView('staff', 'Forms'), true)
})

test('points and redemption rules are deterministic', () => {
  assert.equal(calculateEarnedPoints(1440), 14)
  assert.equal(calculateEarnedPoints(50), 0)
  assert.equal(parsePurchaseAmount('₱1,440.99'), 1440.99)
  assert.equal(parsePurchaseAmount('-100'), null)
  assert.equal(parsePurchaseAmount('1,440.999'), null)
  assert.equal(canRedeem(300, 300), true)
  assert.equal(canRedeem(299, 300), false)
  assert.equal(canRedeem(300, 0), false)
})

test('reward redemption enforces cost and tier requirements', () => {
  const secretMenuReward = { name: 'Secret menu tasting', points: 650, requiredTier: 'Gold', status: 'VIP' }
  const goldMember = { tier: 'Gold', points: 650 }
  const bronzeMember = { tier: 'Bronze', points: 650 }

  assert.equal(canRedeemReward(goldMember, secretMenuReward), true)
  assert.equal(canRedeemReward(bronzeMember, secretMenuReward), false)
  assert.equal(canRedeemReward({ tier: 'Gold', points: 649 }, secretMenuReward), false)
})

test('CSV output escapes commas, quotes, and line breaks', () => {
  assert.equal(
    toCsv([['Member', 'Notes'], ['Kim, Jr.', 'Said "hello"\nthen left']]),
    'Member,Notes\n"Kim, Jr.","Said ""hello""\nthen left"',
  )
})
