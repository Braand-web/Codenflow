/** One private microVM per verified Supabase subject; leases are prepaid durably. */
import { Sandbox } from 'e2b'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

export const LEASE_SECONDS = 900
// Reserve the documented two-minute auto-pause retry window as well.
export const CHARGED_SECONDS = LEASE_SECONDS + 120

/** Resolve only server-owned tenant mappings. Never accepts a client sandbox ID. */
export function runtimeService(store, template, { sdk = Sandbox, limit = 36000, clock = Date.now, fetcher = fetch } = {}) {
  const pending = new Map()
  const active = new Map()
  async function resolve(userId) {
    const cached = active.get(userId)
    // Reconnect early enough to extend the E2B lease before an active request
    // or websocket reaches the sandbox's auto-pause deadline.
    if (cached && cached.deadline > clock() + 180000) return cached
    const tenant = store.tenantRecord(userId)
    const existing = tenant?.sandbox_id
    if (existing) {
      const info = await sdk.getInfo(existing)
      if (info.metadata?.codenflow_user !== userId || info.lifecycle?.autoResume || info.lifecycle?.onTimeout !== 'pause') {
        throw new Error('RUNTIME_OWNERSHIP')
      }
    }
    if (!store.reserve(CHARGED_SECONDS, limit)) throw new Error('BUDGET_EXHAUSTED')
    const sandbox = existing
      ? await sdk.connect(existing, { timeoutMs: LEASE_SECONDS * 1000 })
      : await sdk.create(template, {
        timeoutMs: LEASE_SECONDS * 1000,
        lifecycle: { onTimeout: 'pause', autoResume: false },
        network: { allowPublicTraffic: false },
        metadata: { codenflow_user: userId },
      })
    // Persist ownership before any user code starts; never replace missing environments.
    if (!existing) store.setTenant(userId, sandbox.sandboxId)
    if (!sandbox.trafficAccessToken) throw new Error('RUNTIME_NOT_PRIVATE')
    const target = `https://${sandbox.getHost(3080)}`
    const headers = { 'e2b-traffic-access-token': sandbox.trafficAccessToken, ...(tenant?.runtime_cookie ? { cookie: tenant.runtime_cookie } : {}) }
    const ready = await fetcher(`${target}/health`, { headers, signal: AbortSignal.timeout(5000) }).then(r => r.ok, () => false)
    if (!ready) {
      await sandbox.files.write('/root/codenflow-launch.mjs', await readFile(new URL('./runtime-launch.mjs', import.meta.url), 'utf8'), { user: 'root' })
      await sandbox.files.write('/root/codenflow-health.patch.yml', await readFile(new URL('../codenflow-health.patch.yml', import.meta.url), 'utf8'), { user: 'root' })
      await sandbox.commands.run('flock -n /run/codenflow-launch.lock node /root/codenflow-launch.mjs', {
        background: true, user: 'root',
        envs: { CODENFLOW_RUNTIME_HOST: sandbox.getHost(3080) },
      })
    }
    const timeout = clock() + 90000
    let cookie = tenant?.runtime_cookie
    while (clock() < timeout) {
      try {
        const launch = new URL((await sandbox.files.read('/data/.launch-url', { user: 'root' })).trim())
        if (launch.origin !== target || launch.pathname !== '/' || !launch.searchParams.has('token')) throw new Error('INVALID_LAUNCH')
        const response = await fetcher(launch, { headers, redirect: 'manual', signal: AbortSignal.timeout(5000) })
        if (response.status === 302 || response.status === 303) {
          cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
          if (cookie) { store.setTenantCookie(userId, cookie); break }
        }
      } catch (error) {
        if (error.message === 'INVALID_LAUNCH') throw error
        // Startup files and HTTP readiness may arrive after the command is accepted.
      }
      await delay(1000)
    }
    if (!cookie) throw new Error('RUNTIME_START_FAILED')
    const result = { target, headers: { ...headers, cookie }, sandbox, deadline: clock() + LEASE_SECONDS * 1000 }
    active.set(userId, result)
    return result
  }
  return {
    async get(userId) {
      if (!pending.has(userId)) pending.set(userId, resolve(userId).finally(() => pending.delete(userId)))
      return pending.get(userId)
    },
    async renew(userId) {
      const current = active.get(userId)
      if (current && current.deadline > clock() + 180000) return current
      if (!pending.has(userId)) pending.set(userId, (async () => {
        const runtime = current ?? await resolve(userId)
        if (current && current.deadline <= clock() + 180000) {
          if (!store.reserve(CHARGED_SECONDS, limit)) throw new Error('BUDGET_EXHAUSTED')
          await runtime.sandbox.setTimeout(LEASE_SECONDS * 1000)
          runtime.deadline = clock() + LEASE_SECONDS * 1000
        }
        return runtime
      })().finally(() => pending.delete(userId)))
      return pending.get(userId)
    },
  }
}
