import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Local/dev fallback: everything lives in one JSON file on disk.
// Used whenever DATABASE_URL is not set (unchanged from the original behavior).
export const createJsonFileStore = (dataPath, seed) => {
  const readRaw = () => {
    if (!existsSync(dataPath)) return null
    return JSON.parse(readFileSync(dataPath, 'utf8'))
  }

  const writeRaw = (store) => {
    mkdirSync(dirname(dataPath), { recursive: true })
    writeFileSync(dataPath, JSON.stringify(store, null, 2))
  }

  return {
    async getStore() {
      const store = readRaw() ?? seed()
      writeRaw(store)
      return store
    },
    async writeStore(store) {
      writeRaw(store)
    },
  }
}

// Production backend: the whole store is kept as a single JSONB row.
// This keeps every existing business rule (members, tiers, activities) untouched —
// only where the data is persisted changes. `pool` only needs a
// `query(text, params) => { rows }` method, matching node-postgres's Pool/Client API,
// so this function can be unit-tested with a hand-written fake pool with no
// network access and no `pg` package installed (see server/store.test.js).
export const createPostgresStore = (pool, seed) => {
  let schemaReady = null

  const ensureSchema = async () => {
    if (!schemaReady) {
      schemaReady = pool.query(
        'CREATE TABLE IF NOT EXISTS kodokodo_store (id INTEGER PRIMARY KEY, data JSONB NOT NULL)',
      )
    }
    await schemaReady
  }

  const upsert = async (store) => {
    await pool.query(
      `INSERT INTO kodokodo_store (id, data) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(store)],
    )
  }

  return {
    async getStore() {
      await ensureSchema()
      const result = await pool.query('SELECT data FROM kodokodo_store WHERE id = 1')
      if (result.rows.length > 0) return result.rows[0].data
      const store = seed()
      await upsert(store)
      return store
    },
    async writeStore(store) {
      await ensureSchema()
      await upsert(store)
    },
  }
}

// Only imports the real `pg` package when a Postgres backend is actually needed
// (i.e. DATABASE_URL is set, as it will be on Render). Local dev and the test
// suite never hit this path, so they don't need `pg` installed.
export const createPostgresPool = async (connectionString) => {
  const { default: pg } = await import('pg')
  const useSsl = !/localhost|127\.0\.0\.1/.test(connectionString)
  return new pg.Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  })
}
