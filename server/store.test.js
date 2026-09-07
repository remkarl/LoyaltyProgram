import test from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresStore, createJsonFileStore } from './store.js'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A hand-written stand-in for a node-postgres Pool/Client. It only needs to
// satisfy `query(text, params) => { rows }`, so this validates the exact SQL
// createPostgresStore issues (schema creation, seeding, upsert) without a
// real Postgres server, a `pg` package install, or network access — all of
// which this sandbox doesn't have.
const createFakePool = () => {
  let row = null
  const queryLog = []
  return {
    queryLog,
    async query(text, params) {
      queryLog.push(text.trim().split('\n')[0].trim())
      if (text.includes('CREATE TABLE')) return { rows: [] }
      if (text.startsWith('SELECT data FROM kodokodo_store')) {
        return row ? { rows: [{ data: row }] } : { rows: [] }
      }
      if (text.includes('INSERT INTO kodokodo_store')) {
        // Mirrors real node-postgres: JSONB columns come back already parsed.
        row = JSON.parse(params[0])
        return { rows: [] }
      }
      throw new Error(`Unexpected query in fake pool: ${text}`)
    },
  }
}

test('postgres store seeds once and persists the seed', async () => {
  const pool = createFakePool()
  const seed = () => ({ users: [], members: [], activities: [], seeded: true })
  const store = createPostgresStore(pool, seed)

  const first = await store.getStore()
  assert.deepEqual(first, { users: [], members: [], activities: [], seeded: true })

  const second = await store.getStore()
  assert.deepEqual(second, first, 'second read should return the persisted seed, not reseed')

  const inserts = pool.queryLog.filter((q) => q.includes('INSERT INTO kodokodo_store'))
  assert.equal(inserts.length, 1, 'should only insert the seed once')
})

test('postgres store writeStore persists changes for later getStore calls', async () => {
  const pool = createFakePool()
  const seed = () => ({ members: [{ memberId: 'KD-1', points: 0 }] })
  const store = createPostgresStore(pool, seed)

  const initial = await store.getStore()
  initial.members[0].points = 250
  await store.writeStore(initial)

  const reloaded = await store.getStore()
  assert.equal(reloaded.members[0].points, 250)
})

test('postgres store only creates the schema once across multiple calls', async () => {
  const pool = createFakePool()
  const store = createPostgresStore(pool, () => ({ members: [] }))

  await store.getStore()
  await store.writeStore({ members: [] })
  await store.getStore()

  const schemaCalls = pool.queryLog.filter((q) => q.includes('CREATE TABLE'))
  assert.equal(schemaCalls.length, 1, 'schema should be ensured once, not on every call')
})

test('json file store still works unchanged (local/dev fallback)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kodokodo-store-'))
  const dataPath = join(dir, 'data.json')
  const store = createJsonFileStore(dataPath, () => ({ members: [{ memberId: 'KD-1', points: 0 }] }))

  const first = await store.getStore()
  assert.equal(first.members[0].points, 0)
  assert.ok(existsSync(dataPath))

  first.members[0].points = 90
  await store.writeStore(first)

  const reloaded = await store.getStore()
  assert.equal(reloaded.members[0].points, 90)

  rmSync(dir, { recursive: true, force: true })
})
