// Thin client for the Kodokodo backend (server/index.js). In dev this talks to
// `npm run server` on localhost:8787; in production it talks to whatever
// VITE_API_URL is set to at build time (the deployed Render service).
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

let authToken = null

export const setAuthToken = (token) => {
  authToken = token
}

const request = async (path, { method = 'GET', body } = {}) => {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Could not reach the Kodokodo server. Check your connection and try again.')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`)
  return payload
}

export const api = {
  setAuthToken,
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  signup: (payload) => request('/api/auth/signup', { method: 'POST', body: payload }),
  me: () => request('/api/me'),
  members: () => request('/api/members'),
  activity: () => request('/api/activity'),
  createMember: (payload) => request('/api/members', { method: 'POST', body: payload }),
  earn: (payload) => request('/api/earn', { method: 'POST', body: payload }),
  redeem: (payload) => request('/api/redeem', { method: 'POST', body: payload }),
}
