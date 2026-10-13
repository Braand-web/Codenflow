/** Durable server sessions, tenant ownership, and prepaid execution leases. */
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

const digest = value => createHash('sha256').update(value).digest('hex')

/** Open a private store. Tokens never enter tenant environments. */
export function openStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const db = new DatabaseSync(join(directory, 'gateway.sqlite'))
  chmodSync(join(directory, 'gateway.sqlite'), 0o600)
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, access TEXT NOT NULL,
      refresh TEXT NOT NULL, expires INTEGER NOT NULL, deadline INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenants (
      user_id TEXT PRIMARY KEY, sandbox_id TEXT NOT NULL UNIQUE, runtime_cookie TEXT
    );
    CREATE TABLE IF NOT EXISTS usage (
      month TEXT PRIMARY KEY, reserved_seconds INTEGER NOT NULL
    );
  `)
  if (!db.prepare('PRAGMA table_info(tenants)').all().some(column => column.name === 'runtime_cookie')) {
    db.exec('ALTER TABLE tenants ADD COLUMN runtime_cookie TEXT')
  }
  return {
    createSession(user, tokens) {
      const id = randomBytes(32).toString('base64url')
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)').run(
        digest(id), user.id, tokens.access_token, tokens.refresh_token,
        tokens.expires_at * 1000, Date.now() + 7 * 86400_000,
      )
      return id
    },
    session(id) {
      if (!id || !/^[A-Za-z0-9_-]{43}$/.test(id)) return undefined
      const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND deadline > ?').get(digest(id), Date.now())
      return row
    },
    updateSession(id, tokens) {
      db.prepare('UPDATE sessions SET access = ?, refresh = ?, expires = ? WHERE id = ?').run(
        tokens.access_token, tokens.refresh_token, tokens.expires_at * 1000, digest(id),
      )
    },
    deleteSession(id) { db.prepare('DELETE FROM sessions WHERE id = ?').run(digest(id)) },
    tenant(userId) { return db.prepare('SELECT sandbox_id FROM tenants WHERE user_id = ?').get(userId)?.sandbox_id },
    tenantRecord(userId) { return db.prepare('SELECT sandbox_id, runtime_cookie FROM tenants WHERE user_id = ?').get(userId) },
    setTenant(userId, sandboxId) {
      db.prepare('INSERT INTO tenants(user_id, sandbox_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET sandbox_id = excluded.sandbox_id').run(userId, sandboxId)
    },
    setTenantCookie(userId, cookie) { db.prepare('UPDATE tenants SET runtime_cookie = ? WHERE user_id = ?').run(cookie, userId) },
    reserve(seconds, limit, now = new Date()) {
      const month = now.toISOString().slice(0, 7)
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('INSERT OR IGNORE INTO usage VALUES (?, 0)').run(month)
        const used = db.prepare('SELECT reserved_seconds FROM usage WHERE month = ?').get(month).reserved_seconds
        if (used + seconds > limit) { db.exec('ROLLBACK'); return false }
        db.prepare('UPDATE usage SET reserved_seconds = reserved_seconds + ? WHERE month = ?').run(seconds, month)
        db.exec('COMMIT')
        return true
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    close() { db.close() },
  }
}
