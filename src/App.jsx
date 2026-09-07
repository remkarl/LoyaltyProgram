import { useEffect, useState } from 'react'
import './App.css'
import { api } from './api.js'
import {
  calculateEarnedPoints,
  canRedeemReward,
  canAccessView,
  filterActivityForMember,
  getTierStatus,
  getVisibleNavItems,
  normalizeActivityLog,
  normalizeMembers,
  parsePurchaseAmount,
  toCsv,
} from './loyalty.js'

const tiers = [
  {
    name: 'Bronze',
    title: 'Friend',
    range: '0–499 pts',
    perk: 'Free canned beverage or iced tea on sign-up',
    accent: 'bronze',
  },
  {
    name: 'Silver',
    title: 'Captain',
    range: '500–999 pts',
    perk: 'Premium banchan upgrade or gyeran-jjim on every 3rd visit',
    accent: 'silver',
  },
  {
    name: 'Gold',
    title: 'VIP',
    range: '1,000+ pts',
    perk: 'Priority seating and secret menu access on busy nights',
    accent: 'gold',
  },
]

const getStats = (points, visits) => {
  const tier = getTierStatus(points)

  return [
  { label: 'Points earned', value: new Intl.NumberFormat('en-US').format(points), note: 'This month' },
  { label: 'Visits', value: String(visits), note: 'Last 90 days' },
  { label: 'Next tier', value: tier.pointsToNext ? `${tier.pointsToNext} pts` : 'Complete', note: tier.pointsToNext ? `To ${tier.next}` : 'VIP status' },
  { label: 'Waitlist', value: 'Priority', note: 'Weekend nights' },
  ]
}

const rules = [
  'Earn 1 point for every ₱100 spent on eligible food and non-alcoholic beverages.',
  'Points are awarded only after the final bill is paid and are not issued on refunds or voided transactions.',
  'One account per person, one mobile number per account, and no cash redemption or point transfers.',
  'Rewards expire after 12 months of inactivity and may be adjusted with reasonable notice.',
  'Gold priority seating is based on availability and does not override reservations, accessibility needs, or live queue fairness.',
]

const notifications = [
  {
    title: 'Welcome bonus',
    text: 'Welcome to Kodokodo Rewards! Enjoy a free mandu on your next visit and a complimentary Hite, Cass, or iced tea as your Bronze welcome perk.',
  },
  {
    title: 'Milestone alert',
    text: 'You are just 420 points away from Captain status. Earn premium banchan perks and gyeran-jjim on your next 3rd visit.',
  },
  {
    title: 'Weekend priority',
    text: 'VIP members receive priority seating consideration on busy weekend nights. View our secret menu before peak time.',
  },
]

const redeemOptions = [
  { name: 'Premium banchan upgrade', points: 300, status: 'Ready', requiredTier: 'Bronze' },
  { name: 'Gyeran-jjim add-on', points: 420, status: 'Available', requiredTier: 'Bronze' },
  { name: 'Free Hite / Cass', points: 180, status: 'Popular', requiredTier: 'Bronze' },
  { name: 'Secret menu tasting', points: 650, status: 'VIP', requiredTier: 'Gold' },
]

const navItems = [
  { label: 'Overview', kicker: 'Operations' },
  { label: 'Members', kicker: 'CRM' },
  { label: 'Forms', kicker: 'Capture' },
  { label: 'Rewards', kicker: 'Offers' },
]

const navTitles = {
  Overview: 'Reward Center',
  Members: 'Member Directory',
  Forms: 'Capture Center',
  Rewards: 'Redemption Engine',
}

const memberFilterOptions = ['All', 'Gold', 'Silver', 'Bronze']

// Only the session (token + role + memberId) is kept in localStorage, so a
// page refresh doesn't sign you out. Member and activity data always comes
// live from the API — it's the shared source of truth, not a per-browser copy.
const authStorageKey = 'kodokodo-auth'

const getStoredAuth = () => {
  try {
    const stored = window.localStorage.getItem(authStorageKey)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function App() {
  const storedAuth = getStoredAuth()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(storedAuth?.token))
  const [authMode, setAuthMode] = useState('login')
  const [userRole, setUserRole] = useState(storedAuth?.role ?? 'staff')
  const [loginForm, setLoginForm] = useState({ email: '', password: '', role: 'staff' })
  const [signupForm, setSignupForm] = useState({ fullName: '', mobile: '', email: '', birthday: 'January', password: '' })
  const [loginError, setLoginError] = useState('')
  const [activeView, setActiveView] = useState('Overview')
  const [memberFilter, setMemberFilter] = useState('All')
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedReward, setSelectedReward] = useState('')
  const [activeMemberId, setActiveMemberId] = useState(storedAuth?.memberId ?? '')
  const [memberDirectory, setMemberDirectory] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [joinForm, setJoinForm] = useState({ fullName: '', mobile: '', email: '', birthday: 'January' })
  const [earnForm, setEarnForm] = useState({ memberId: storedAuth?.memberId ?? '', receiptNo: '', purchaseAmount: '', serviceType: 'Dinner' })
  const [redeemForm, setRedeemForm] = useState({ memberId: storedAuth?.memberId ?? '', reward: redeemOptions[0].name, points: String(redeemOptions[0].points) })
  const [statusMessage, setStatusMessage] = useState('Ready for member capture')
  const visibleNavItems = getVisibleNavItems(userRole, navItems)
  const activeNav = visibleNavItems.find((item) => item.label === activeView) ?? visibleNavItems[0]
  const pageTitle = userRole === 'member' && activeView === 'Overview' ? 'My Rewards' : navTitles[activeView]
  const activeMember = memberDirectory.find((member) => member.memberId === activeMemberId) ?? memberDirectory[0]
  const earnMember = memberDirectory.find((member) => member.memberId === earnForm.memberId.trim())
  const redeemMember = memberDirectory.find((member) => member.memberId === redeemForm.memberId.trim())
  const redeemReward = redeemOptions.find((item) => item.name === redeemForm.reward)
  const earnAmount = parsePurchaseAmount(earnForm.purchaseAmount)
  const earnPreview = earnAmount === null ? 0 : calculateEarnedPoints(earnAmount)
  const activeMemberPoints = activeMember?.points ?? 0
  const stats = getStats(activeMemberPoints, activeMember?.visits ?? 0)
  const tierStatus = getTierStatus(activeMemberPoints)
  const filteredMembers = memberDirectory.filter((member) => {
    const matchesTier = memberFilter === 'All' || member.tier === memberFilter
    const searchTerm = memberSearch.trim().toLowerCase()
    const matchesSearch = !searchTerm
      || member.name.toLowerCase().includes(searchTerm)
      || member.memberId.toLowerCase().includes(searchTerm)
      || member.tier.toLowerCase().includes(searchTerm)
      || member.lastVisit.toLowerCase().includes(searchTerm)

    return matchesTier && matchesSearch
  })

  const visibleActivity = userRole === 'member'
    ? filterActivityForMember(activityLog, activeMemberId)
    : activityLog

  const persistAuth = (token, role, memberId) => {
    api.setAuthToken(token)
    try {
      window.localStorage.setItem(authStorageKey, JSON.stringify({ token, role, memberId: memberId ?? null }))
    } catch {
      // localStorage can be unavailable (private browsing, quota); the session
      // still works for this tab, it just won't survive a refresh.
    }
  }

  const clearAuth = () => {
    api.setAuthToken(null)
    try {
      window.localStorage.removeItem(authStorageKey)
    } catch {
      // see persistAuth
    }
  }

  // Always re-fetches from the server rather than patching local state, so the
  // UI can never drift from what actually got written to Postgres.
  const refreshData = async (role) => {
    if (role === 'staff') {
      const [membersPayload, activityPayload] = await Promise.all([api.members(), api.activity()])
      const members = normalizeMembers(membersPayload.members)
      setMemberDirectory(members)
      setActivityLog(normalizeActivityLog(activityPayload.activities))
      setActiveMemberId((current) => (
        members.some((member) => member.memberId === current) ? current : (members[0]?.memberId ?? '')
      ))
    } else {
      const [mePayload, activityPayload] = await Promise.all([api.me(), api.activity()])
      const member = mePayload.member
      setMemberDirectory(member ? normalizeMembers([member]) : [])
      setActivityLog(normalizeActivityLog(activityPayload.activities))
      if (member) {
        setActiveMemberId(member.memberId)
        setEarnForm((current) => ({ ...current, memberId: member.memberId }))
        setRedeemForm((current) => ({ ...current, memberId: member.memberId }))
      }
    }
  }

  useEffect(() => {
    if (!storedAuth?.token) {
      setIsBootstrapping(false)
      return
    }
    api.setAuthToken(storedAuth.token)
    refreshData(storedAuth.role)
      .then(() => {
        setUserRole(storedAuth.role)
        setIsAuthenticated(true)
      })
      .catch(() => clearAuth())
      .finally(() => setIsBootstrapping(false))
    // Only ever run once, at mount, to restore a saved session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMemberScan = () => {
    if (userRole !== 'staff') return
    setActiveView('Members')
    setStatusMessage('Member directory ready for a live scan')
  }

  const handleOpenForms = () => {
    if (userRole !== 'staff') {
      setStatusMessage('Member access is limited to your own rewards')
      return
    }
    setActiveView('Forms')
    setStatusMessage('Capture Center ready for registration, earning, or redemption')
  }

  const handleExport = () => {
    if (userRole !== 'staff') return
    const rows = [
      ['Member ID', 'Member', 'Tier', 'Last visit', 'Points'],
      ...memberDirectory.map((member) => [member.memberId, member.name, member.tier, member.lastVisit, member.points]),
    ]
    const csv = toCsv(rows)
    const downloadUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'kodokodo-members.csv'
    link.click()
    URL.revokeObjectURL(downloadUrl)
    setStatusMessage('Member directory exported as CSV')
  }

  const handleSignOut = () => {
    clearAuth()
    setIsAuthenticated(false)
    setUserRole('staff')
    setActiveView('Overview')
    setMemberDirectory([])
    setActivityLog([])
    setActiveMemberId('')
  }

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    try {
      const { token, role, memberId } = await api.login({
        email: loginForm.email.trim(),
        password: loginForm.password,
        role: loginForm.role,
      })
      persistAuth(token, role, memberId)
      setLoginError('')
      setUserRole(role)
      await refreshData(role)
      if (role === 'member') setActiveView('Overview')
      setIsAuthenticated(true)
    } catch (error) {
      setLoginError(error.message)
    }
  }

  const handleSignupSubmit = async (event) => {
    event.preventDefault()
    try {
      const { token, role, memberId } = await api.signup({
        fullName: signupForm.fullName.trim(),
        mobile: signupForm.mobile.trim(),
        email: signupForm.email.trim(),
        password: signupForm.password,
      })
      persistAuth(token, role, memberId)
      setLoginError('')
      setUserRole(role)
      await refreshData(role)
      setActiveView('Overview')
      setStatusMessage(`${signupForm.fullName.trim()} joined Kodokodo Rewards`)
      setIsAuthenticated(true)
    } catch (error) {
      setLoginError(error.message)
    }
  }

  const handleRewardSelect = (reward) => {
    setSelectedReward(reward.name)
    setStatusMessage(`${reward.name} selected for ${reward.points} points`)
    setRedeemForm((current) => ({ ...current, reward: reward.name, points: String(reward.points) }))
  }

  const handleMemberSelect = (member) => {
    setActiveMemberId(member.memberId)
    setEarnForm((current) => ({ ...current, memberId: member.memberId }))
    setRedeemForm((current) => ({ ...current, memberId: member.memberId }))
    setStatusMessage(`${member.name} selected (${member.memberId})`)
    setActiveView('Forms')
  }

  const handleJoinSubmit = async (event) => {
    event.preventDefault()
    if (!joinForm.fullName.trim() || !joinForm.mobile.trim() || !joinForm.email.trim()) {
      setStatusMessage('Complete the member name, mobile, and email fields')
      return
    }

    try {
      const { member } = await api.createMember({
        fullName: joinForm.fullName.trim(),
        mobile: joinForm.mobile.trim(),
        email: joinForm.email.trim(),
      })
      await refreshData('staff')
      setStatusMessage(`${member.name} is ready for Kodokodo Rewards`)
      setActiveView('Members')
      setJoinForm({ fullName: '', mobile: '', email: '', birthday: 'January' })
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const handleEarnSubmit = async (event) => {
    event.preventDefault()
    const purchaseAmount = parsePurchaseAmount(earnForm.purchaseAmount)
    if (!earnForm.memberId.trim() || !earnForm.receiptNo.trim() || purchaseAmount === null || purchaseAmount <= 0) {
      setStatusMessage('Add a member ID, receipt number, and purchase amount')
      return
    }

    try {
      const { points } = await api.earn({
        memberId: earnForm.memberId.trim(),
        receiptNo: earnForm.receiptNo.trim(),
        purchaseAmount,
        serviceType: earnForm.serviceType,
      })
      await refreshData('staff')
      setStatusMessage(`${points} points awarded to ${earnForm.memberId}`)
      setEarnForm((current) => ({ ...current, receiptNo: '', purchaseAmount: '' }))
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const handleRedeemSubmit = async (event) => {
    event.preventDefault()
    const reward = redeemOptions.find((item) => item.name === redeemForm.reward)
    if (!redeemForm.memberId.trim() || !reward) {
      setStatusMessage('Select a valid member ID and reward')
      return
    }

    try {
      await api.redeem({ memberId: redeemForm.memberId.trim(), reward: reward.name })
      await refreshData('staff')
      setSelectedReward(reward.name)
      setStatusMessage(`${reward.name} redeemed for ${redeemForm.memberId}`)
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const renderMainContent = () => {
    if (!canAccessView(userRole, activeView)) {
      return (
        <main className="page">
          <section className="card access-blocked">
            <p className="eyebrow">Personal account</p>
            <h3>This area is reserved for Kodokodo staff.</h3>
            <p>Use My Rewards to view your points, tier, and available rewards.</p>
            <button type="button" className="primary-button" onClick={() => setActiveView('Overview')}>Return to My Rewards</button>
          </section>
        </main>
      )
    }

    switch (activeView) {
      case 'Members':
        return (
          <main className="page">
            <section className="hero card">
              <div className="qr-card">
                <div className="qr-box" aria-label="Mock QR code card">
                  <span>QR</span>
                </div>
                <p className="qr-label">Member signup</p>
                <h3>Scan to join Kodokodo Rewards</h3>
                <div className="qr-meta">
                  <span>Mobile check-in</span>
                  <span>1 pt / ₱100</span>
                </div>
                <button type="button" className="primary-button small-btn" onClick={handleOpenForms}>
                  Open signup link
                </button>
              </div>

              <div className="member-card">
                <div className="card-row">
                  <span className="chip success">{tierStatus.name} / {tierStatus.title}</span>
                  <span className="chip muted">Member ID: {activeMember?.memberId ?? 'Unavailable'}</span>
                </div>
                <p className="member-name">{activeMember?.name ?? 'Member profile'}</p>

                <div className="points-block">
                  <p>Available points</p>
                  <strong>{new Intl.NumberFormat('en-US').format(activeMemberPoints)}</strong>
                </div>

                <div className="progress-wrap" aria-label="Progress to next tier">
                  <div className="progress-labels">
                    <span>{tierStatus.name}</span>
                    <span>{tierStatus.next}</span>
                  </div>
                  <div className="progress-bar">
                    <span className="progress-fill" style={{ width: `${tierStatus.progress}%` }}></span>
                  </div>
                </div>

                <div className="member-rewards">
                  <div>
                    <small>Preferred table</small>
                    <strong>Window booth</strong>
                  </div>
                  <div>
                    <small>Birthday perk</small>
                    <strong>Redeem soon</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="stats-grid" aria-label="Member summary">
              {stats.map((item) => (
                <article className="mini-stat card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.note}</small>
                </article>
              ))}
            </section>

            <section className="dashboard-grid">
              <article className="card dashboard-card">
                <div className="section-heading left">
                  <p className="eyebrow">Customer overview</p>
                  <h3>Member directory</h3>
                  <button type="button" className="primary-button form-link-button" onClick={handleOpenForms}>
                    Open member forms
                  </button>
                </div>

                <div className="table-wrap">
                  <div className="member-toolbar">
                    <input
                      className="member-search"
                      type="search"
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Search members"
                      aria-label="Search members"
                    />
                    <div className="filter-pills" aria-label="Filter members by tier">
                      {memberFilterOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`filter-pill ${memberFilter === option ? 'active' : ''}`}
                          onClick={() => setMemberFilter(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Member ID</th>
                        <th>Member</th>
                        <th>Tier</th>
                        <th>Last visit</th>
                        <th>Points</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.length > 0 ? filteredMembers.map((member) => (
                        <tr key={member.memberId}>
                          <td>{member.memberId}</td>
                          <td>{member.name}</td>
                          <td>{member.tier}</td>
                          <td>{member.lastVisit}</td>
                          <td>{new Intl.NumberFormat('en-US').format(member.points)}</td>
                          <td>
                            <button type="button" className="table-action" onClick={() => handleMemberSelect(member)}>
                              Use member
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="6" className="empty-state">No members match this search.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="card dashboard-card">
                <div className="section-heading left">
                  <p className="eyebrow">Loyalty habits</p>
                  <h3>Member activity</h3>
                </div>

                <div className="admin-metrics">
                  <div className="metric">
                    <strong>18</strong>
                    <span>Visits this quarter</span>
                  </div>
                  <div className="metric">
                    <strong>4.9/5</strong>
                    <span>NPS score</span>
                  </div>
                  <div className="metric">
                    <strong>62%</strong>
                    <span>Repeat guests</span>
                  </div>
                  <div className="metric">
                    <strong>23</strong>
                    <span>Birthday perks</span>
                  </div>
                </div>
              </article>
            </section>

            <section className="info-grid">
              <article className="card activity-card">
                <div className="section-heading left">
                  <p className="eyebrow">Audit trail</p>
                  <h3>Recent activity</h3>
                </div>
                <div className="activity-list">
                  {visibleActivity.map((activity, index) => (
                    <div className="activity-item" key={`${activity.action}-${activity.detail}-${index}`}>
                      <div>
                        <strong>{activity.action}</strong>
                        <span>{activity.detail}</span>
                      </div>
                      <div className="activity-meta">
                        <b>{activity.amount}</b>
                        <small>{activity.date}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="card script-card">
                <div className="section-heading left">
                  <p className="eyebrow">Member care</p>
                  <h3>Keep the welcome personal</h3>
                </div>
                <blockquote>
                  “Thanks for joining Kodokodo Rewards. Your points and birthday perk are ready for your next visit.”
                </blockquote>
              </article>
            </section>
          </main>
        )

      case 'Forms':
        return (
          <main className="page">
            <section className="section-heading">
              <p className="eyebrow">Front-of-house workflows</p>
              <h3>Capture, reward, retain</h3>
            </section>

            <section className="forms-grid">
              <form className="card form-card" onSubmit={handleJoinSubmit}>
                <div className="section-heading left">
                  <p className="eyebrow">Customer registration</p>
                  <h3>Join Kodokodo Rewards</h3>
                </div>
                <div className="field-grid">
                  <label>
                    Full name
                    <input type="text" value={joinForm.fullName} onChange={(event) => setJoinForm({ ...joinForm, fullName: event.target.value })} placeholder="Yuna Park" />
                  </label>
                  <label>
                    Mobile number
                    <input type="tel" value={joinForm.mobile} onChange={(event) => setJoinForm({ ...joinForm, mobile: event.target.value })} placeholder="+63 917 890 2241" />
                  </label>
                  <label>
                    Email
                    <input type="email" value={joinForm.email} onChange={(event) => setJoinForm({ ...joinForm, email: event.target.value })} placeholder="yuna@kodokodo.ph" />
                  </label>
                  <label>
                    Birthday month
                    <select value={joinForm.birthday} onChange={(event) => setJoinForm({ ...joinForm, birthday: event.target.value })}>
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month) => <option key={month}>{month}</option>)}
                    </select>
                  </label>
                </div>
                <button type="submit" className="primary-button form-button">Create member</button>
              </form>

              <form className="card form-card" onSubmit={handleEarnSubmit}>
                <div className="section-heading left">
                  <p className="eyebrow">Checkout activity</p>
                  <h3>Earn points</h3>
                </div>
                <div className="field-grid">
                  <label>
                    Member ID
                    <input type="text" value={earnForm.memberId} onChange={(event) => setEarnForm({ ...earnForm, memberId: event.target.value })} />
                  </label>
                  <label>
                    Receipt number
                    <input type="text" value={earnForm.receiptNo} onChange={(event) => setEarnForm({ ...earnForm, receiptNo: event.target.value })} placeholder="RCP-4812" />
                  </label>
                  <label>
                    Purchase amount
                    <input type="text" inputMode="numeric" value={earnForm.purchaseAmount} onChange={(event) => setEarnForm({ ...earnForm, purchaseAmount: event.target.value })} placeholder="₱1,440" />
                  </label>
                  <label>
                    Service type
                    <select value={earnForm.serviceType} onChange={(event) => setEarnForm({ ...earnForm, serviceType: event.target.value })}>
                      <option>Lunch</option>
                      <option>Dinner</option>
                      <option>Event</option>
                      <option>Takeout</option>
                    </select>
                  </label>
                </div>
                <p className="form-note">
                  {earnMember && earnAmount !== null
                    ? `${earnMember.name} will move from ${earnMember.points} to ${earnMember.points + earnPreview} points.`
                    : earnMember
                      ? `${earnMember.name} currently has ${earnMember.points} points.`
                      : 'Select a valid member ID to preview the new balance.'}
                </p>
                <button type="submit" className="primary-button form-button">Award points</button>
              </form>

              <form className="card form-card" onSubmit={handleRedeemSubmit}>
                <div className="section-heading left">
                  <p className="eyebrow">Rewards desk</p>
                  <h3>Redeem a reward</h3>
                </div>
                <div className="field-grid">
                  <label>
                    Member ID
                    <input type="text" value={redeemForm.memberId} onChange={(event) => setRedeemForm({ ...redeemForm, memberId: event.target.value })} />
                  </label>
                  <label>
                    Reward
                    <select value={redeemForm.reward} onChange={(event) => {
                      const reward = redeemOptions.find((item) => item.name === event.target.value)
                      setRedeemForm({ ...redeemForm, reward: event.target.value, points: String(reward?.points ?? 0) })
                    }}>
                      {redeemOptions.map((reward) => <option key={reward.name}>{reward.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Cost in points
                    <input type="number" value={redeemForm.points} readOnly aria-label="Reward cost in points" />
                  </label>
                </div>
                <p className="form-note">
                  {redeemMember && redeemReward
                    ? `${redeemMember.name} has ${new Intl.NumberFormat('en-US').format(redeemMember.points)} points. ${redeemReward.name} costs ${redeemReward.points}.`
                    : 'Select a valid member ID to continue.'}
                </p>
                <button type="submit" className="primary-button form-button" disabled={!canRedeemReward(redeemMember, redeemReward)}>
                  Redeem reward
                </button>
              </form>
            </section>
          </main>
        )

      case 'Rewards':
        return (
          <main className="page">
            <section className="tiers-section">
              <div className="section-heading">
                <p className="eyebrow">Culturally themed tiers</p>
                <h3>From Friend to VIP</h3>
              </div>

              <div className="tiers-grid">
                {tiers.map((tier) => (
                  <article className={`tier-card card ${tier.accent}`} key={tier.name}>
                    <div className="tier-badge">{tier.name}</div>
                    <h4>{tier.title}</h4>
                    <p className="tier-range">{tier.range}</p>
                    <p className="tier-perk">{tier.perk}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rewards-grid">
              <div className="card rewards-card">
                <div className="section-heading left">
                  <p className="eyebrow">Reward catalog</p>
                  <h3>Available redemptions</h3>
                </div>
                <div className="reward-list">
                  {redeemOptions.map((reward) => (
                    <button
                      key={reward.name}
                      type="button"
                      className={`reward-item ${selectedReward === reward.name ? 'selected' : ''}`}
                      aria-pressed={selectedReward === reward.name}
                      onClick={() => handleRewardSelect(reward)}
                    >
                      <div>
                        <strong>{reward.name}</strong>
                        <span>{reward.status}</span>
                      </div>
                      <b>{reward.points} pts</b>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="notifications-section">
              <div className="section-heading">
                <p className="eyebrow">SMS & push prompts</p>
                <h3>3 ways to drive sign-ups</h3>
              </div>

              <div className="notification-grid">
                {notifications.map((item) => (
                  <article className="notification card" key={item.title}>
                    <span className="tag">{item.title}</span>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </section>
          </main>
        )

      default:
        return (
          <main className="page">
            <section className="hero card">
              <div className="qr-card">
                <div className="qr-box" aria-label="Mock QR code card">
                  <span>QR</span>
                </div>
                <p className="qr-label">Member signup</p>
                <h3>Scan to join Kodokodo Rewards</h3>
                <div className="qr-meta">
                  <span>Mobile check-in</span>
                  <span>1 pt / ₱100</span>
                </div>
                <button type="button" className="primary-button small-btn" onClick={handleOpenForms}>
                  Open signup link
                </button>
              </div>

              <div className="member-card">
                <div className="card-row">
                  <span className="chip success">{tierStatus.name} / {tierStatus.title}</span>
                  <span className="chip muted">Member ID: {activeMember?.memberId ?? 'Unavailable'}</span>
                </div>
                <p className="member-name">{activeMember?.name ?? 'Member profile'}</p>

                <div className="points-block">
                  <p>Available points</p>
                  <strong>{new Intl.NumberFormat('en-US').format(activeMemberPoints)}</strong>
                </div>

                <div className="progress-wrap" aria-label="Progress to next tier">
                  <div className="progress-labels">
                    <span>{tierStatus.name}</span>
                    <span>{tierStatus.next}</span>
                  </div>
                  <div className="progress-bar">
                    <span className="progress-fill" style={{ width: `${tierStatus.progress}%` }}></span>
                  </div>
                </div>

                <div className="member-rewards">
                  <div>
                    <small>Next unlock</small>
                    <strong>Premium banchan</strong>
                  </div>
                  <div>
                    <small>Weekend priority</small>
                    <strong>Available</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="stats-grid" aria-label="Member summary">
              {stats.map((item) => (
                <article className="mini-stat card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.note}</small>
                </article>
              ))}
            </section>

            {userRole === 'member' && (
              <section className="info-grid">
                <article className="card activity-card">
                  <div className="section-heading left">
                    <p className="eyebrow">Your account</p>
                    <h3>Recent activity</h3>
                  </div>
                  <div className="activity-list">
                    {visibleActivity.slice(0, 4).map((activity, index) => (
                      <div className="activity-item" key={`${activity.action}-${activity.detail}-${index}`}>
                        <div>
                          <strong>{activity.action}</strong>
                          <span>{activity.detail}</span>
                        </div>
                        <div className="activity-meta">
                          <b>{activity.amount}</b>
                          <small>{activity.date}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="card script-card">
                  <div className="section-heading left">
                    <p className="eyebrow">Your next visit</p>
                    <h3>Rewards are ready</h3>
                  </div>
                  <blockquote>
                    “Bring your member ID to the table and we’ll take care of the points and perks.”
                  </blockquote>
                </article>
              </section>
            )}

            <section className="tiers-section">
              <div className="section-heading">
                <p className="eyebrow">Culturally themed tiers</p>
                <h3>From Friend to VIP</h3>
              </div>

              <div className="tiers-grid">
                {tiers.map((tier) => (
                  <article className={`tier-card card ${tier.accent}`} key={tier.name}>
                    <div className="tier-badge">{tier.name}</div>
                    <h4>{tier.title}</h4>
                    <p className="tier-range">{tier.range}</p>
                    <p className="tier-perk">{tier.perk}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="info-grid">
              <div className="rule-card card">
                <div className="section-heading left">
                  <p className="eyebrow">Program rules</p>
                  <h3>Strong controls and fair usage</h3>
                </div>
                <ul>
                  {rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>

              <div className="script-card card">
                <div className="section-heading left">
                  <p className="eyebrow">Floor execution</p>
                  <h3>Checkout prompt</h3>
                </div>
                <blockquote>
                  “Are you part of our rewards program yet? Scanning your phone today unlocks free mandu on your next visit!”
                </blockquote>
                <div className="script-actions">
                  <span>Prompt before payment</span>
                  <span>Scan QR • confirm points • close bill</span>
                </div>
              </div>
            </section>

            <section className="notifications-section">
              <div className="section-heading">
                <p className="eyebrow">SMS & push prompts</p>
                <h3>3 ways to drive sign-ups</h3>
              </div>

              <div className="notification-grid">
                {notifications.map((item) => (
                  <article className="notification card" key={item.title}>
                    <span className="tag">{item.title}</span>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rewards-grid">
              <div className="card rewards-card">
                <div className="section-heading left">
                  <p className="eyebrow">Reward catalog</p>
                  <h3>Available redemptions</h3>
                </div>
                <div className="reward-list">
                  {redeemOptions.map((reward) => (
                    <button
                      key={reward.name}
                      type="button"
                      className={`reward-item ${selectedReward === reward.name ? 'selected' : ''}`}
                      aria-pressed={selectedReward === reward.name}
                      onClick={() => handleRewardSelect(reward)}
                    >
                      <div>
                        <strong>{reward.name}</strong>
                        <span>{reward.status}</span>
                      </div>
                      <b>{reward.points} pts</b>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </main>
        )
    }
  }

  if (isBootstrapping) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-brand">
            <div className="brand-mark">K</div>
            <div>
              <p className="brand-kicker">Kodokodo</p>
              <h1>Rewards console</h1>
            </div>
          </div>
          <p>Restoring your session…</p>
        </section>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-brand">
            <div className="brand-mark">K</div>
            <div>
              <p className="brand-kicker">Kodokodo</p>
              <h1>Rewards console</h1>
            </div>
          </div>

          <div className="login-heading">
            <p className="eyebrow">{authMode === 'login' ? 'Team access' : 'New member access'}</p>
            <h2>{authMode === 'login' ? 'Welcome back.' : 'Pull up a chair.'}</h2>
            <p>{authMode === 'login' ? 'Sign in to manage members, points, and rewards.' : 'Create a Kodokodo Rewards profile and start earning on every visit.'}</p>
          </div>

          <form className="login-form" onSubmit={authMode === 'login' ? handleLoginSubmit : handleSignupSubmit}>
            {authMode === 'signup' && (
              <>
                <label>
                  Full name
                  <input type="text" value={signupForm.fullName} onChange={(event) => setSignupForm({ ...signupForm, fullName: event.target.value })} placeholder="Yuna Park" autoComplete="name" required />
                </label>
                <label>
                  Mobile number
                  <input type="tel" value={signupForm.mobile} onChange={(event) => setSignupForm({ ...signupForm, mobile: event.target.value })} placeholder="+63 917 890 2241" autoComplete="tel" required />
                </label>
              </>
            )}
            {authMode === 'login' && (
              <label>
                Access profile
                <select value={loginForm.role} onChange={(event) => setLoginForm({ ...loginForm, role: event.target.value })}>
                  <option value="staff">Staff / manager</option>
                  <option value="member">Customer / member</option>
                </select>
              </label>
            )}
            <label>
              {authMode === 'login' ? 'Work email' : 'Email address'}
              <input
                type="email"
                value={authMode === 'login' ? loginForm.email : signupForm.email}
                onChange={(event) => authMode === 'login'
                  ? setLoginForm({ ...loginForm, email: event.target.value })
                  : setSignupForm({ ...signupForm, email: event.target.value })}
                placeholder={authMode === 'login' ? 'manager@kodokodo.ph' : 'you@example.com'}
                autoComplete="email"
                required
              />
            </label>
            {authMode === 'signup' && (
              <label>
                Birthday month
                <select value={signupForm.birthday} onChange={(event) => setSignupForm({ ...signupForm, birthday: event.target.value })}>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month) => <option key={month}>{month}</option>)}
                </select>
              </label>
            )}
            <label>
              Password
              <input
                type="password"
                value={authMode === 'login' ? loginForm.password : signupForm.password}
                onChange={(event) => authMode === 'login'
                  ? setLoginForm({ ...loginForm, password: event.target.value })
                  : setSignupForm({ ...signupForm, password: event.target.value })}
                placeholder={authMode === 'login' ? 'Enter your password' : 'Create a password'}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                minLength="8"
                required
              />
            </label>
            {loginError && <p className="login-error" role="alert">{loginError}</p>}
            <button type="submit" className="primary-button login-button">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>

          {authMode === 'login' ? <div className="demo-access">
            <span>Demo access</span>
            <strong>Staff: manager@kodokodo.ph / kodokodo123</strong>
            <strong>Member: yuna@kodokodo.ph / kodokodo123</strong>
          </div> : <p className="signup-note">Your account starts at Bronze with 0 points. You can earn 1 point for every ₱100 spent.</p>}

          <button type="button" className="auth-toggle" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setLoginError('') }}>
            {authMode === 'login' ? 'New to Kodokodo? Create an account' : 'Already have an account? Sign in'}
          </button>
        </section>
        <aside className="login-aside">
          <p className="eyebrow">Service, remembered</p>
          <h2>Every visit should feel like coming back to a favorite table.</h2>
          <div className="login-aside-stats">
            <div><strong>1 pt</strong><span>per ₱100 spent</span></div>
            <div><strong>3 tiers</strong><span>from Friend to VIP</span></div>
          </div>
        </aside>
      </main>
    )
  }

  return (
    <div className="app-shell layout-shell">
      <aside className="sidebar card">
        <div className="sidebar-brand">
          <div className="brand-mark">K</div>
          <div>
            <p className="brand-kicker">Kodokodo</p>
            <h2>Rewards</h2>
          </div>
        </div>

        <nav className="nav-list" aria-label="Sidebar navigation">
          {visibleNavItems.map((item) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={activeView === item.label}
              className={`nav-item ${activeView === item.label ? 'active' : ''}`}
              onClick={() => setActiveView(item.label)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="mini-pill">Live</div>
          <span>{userRole === 'staff' ? 'Service sync active' : 'Personal account active'}</span>
        </div>
      </aside>

      <div className="content-panel">
        <header className="topbar">
          <div className="brand-wrap">
            <div>
              <p className="brand-kicker">{activeNav.kicker}</p>
              <h2>{pageTitle}</h2>
            </div>
          </div>
          <div className="topbar-actions">
            {userRole === 'staff' && <>
              <button type="button" className="ghost-button" onClick={handleMemberScan}>
                Scan Member
              </button>
              <button type="button" className="ghost-button primary-ghost" onClick={handleExport}>
                Export
              </button>
            </>}
            <button type="button" className="ghost-button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <div className="view-summary">
          <span>{userRole === 'member' ? 'Personal account' : activeNav.kicker}</span>
          <strong>{userRole === 'member' && activeView === 'Overview' ? 'My rewards' : activeView}</strong>
        </div>

        <div className="status-banner" aria-live="polite">
          {statusMessage}
        </div>

        {renderMainContent()}
      </div>
    </div>
  )
}

export default App
