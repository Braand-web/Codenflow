import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { openStore } from '../store.mjs'
import { createGateway, backendHeaders } from '../app.mjs'
import { sessionId, sessionCookie } from '../auth.mjs'
import { runtimeService, deferredRuntime, CHARGED_SECONDS } from '../runtime.mjs'

test('sessions, ownership and consumed budget survive reopening', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codenflow-store-'))
  let store = openStore(directory)
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }) })
  const token = store.createSession({ id: 'alice' }, { access_token: 'access', refresh_token: 'refresh', expires_at: Date.now() / 1000 + 600 })
  assert.notEqual(store.session(token).id, token)
  store.setTenant('alice', 'sandbox-a')
  store.setTenantCookie('alice', 'dsh=private')
  assert.throws(() => store.setTenant('bob', 'sandbox-a'))
  assert.equal(store.reserve(420, 500), true)
  store.close()
  store = openStore(directory)
  assert.equal(store.session(token).user_id, 'alice')
  assert.equal(store.tenant('alice'), 'sandbox-a')
  assert.equal(store.tenantRecord('alice').runtime_cookie, 'dsh=private')
  assert.equal(store.tenant('bob'), undefined)
  assert.equal(store.reserve(81, 500), false)
  assert.equal(store.reserve(80, 500), true)
  store.deleteSession(token)
  assert.equal(store.session(token), undefined)
})

test('cookies reject ambiguity and backend headers exclude gateway credentials', () => {
  assert.equal(sessionId('__Host-codenflow-session=a; __Host-codenflow-session=b'), undefined)
  assert.match(sessionCookie('test'), /HttpOnly.*Secure/)
  const headers = backendHeaders({ cookie: 'gateway-secret', authorization: 'bearer-secret', 'x-forwarded-host': 'attacker', 'e2b-traffic-access-token': 'attacker', accept: '*/*' }, { target: 'https://tenant.example', headers: { cookie: 'dsh=private', 'e2b-traffic-access-token': 'private-token' } })
  assert.equal(headers.authorization, undefined)
  assert.equal(headers['x-forwarded-host'], undefined)
  assert.equal(headers.cookie, 'dsh=private')
  assert.equal(headers.origin, 'https://tenant.example')
})

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

test('HTTP routes users separately and denies anonymous, cross-origin and revoked access', async t => {
  const backends = []
  for (const name of ['alice', 'bob']) {
    let target
    const server = createServer((req, res) => {
      res.setHeader('set-cookie', 'internal=secret')
      res.setHeader('location', `${target}/projects/${name}?token=private`)
      res.end(JSON.stringify({ name, headers: req.headers }))
    })
    target = await listen(server)
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
    backends.push(target)
  }
  let revoked = false
  const auth = { user: async id => !revoked && ['alice', 'bob'].includes(id) ? { id } : undefined, logout() {} }
  const gateway = createGateway({ auth, origin: 'http://127.0.0.1', runtime: { get: async id => ({ target: backends[id === 'alice' ? 0 : 1], headers: { cookie: 'dsh=private' } }) } })
  const address = await listen(gateway.server)
  t.after(() => gateway.close())
  const call = (path, options = {}) => new Promise((resolve, reject) => {
    const req = request(address + path, { ...options, headers: { host: '127.0.0.1', ...options.headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })))
    })
    req.on('error', reject)
    req.end()
  })
  assert.equal((await call('/api/settings')).status, 401)
  assert.match(await (await call('/')).text(), /Se connecter/)
  assert.equal((await call('/api/settings', { headers: { origin: 'https://attacker.example', cookie: 'codenflow-session=alice' } })).status, 403)
  assert.equal((await call('/api/settings', { method: 'POST', headers: { cookie: 'codenflow-session=alice' } })).status, 403)
  for (const name of ['alice', 'bob']) {
    const response = await call('/api/settings', { headers: { cookie: `codenflow-session=${name}`, authorization: 'SECRET' } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('location'), `/projects/${name}`)
    const body = await response.json()
    assert.equal(body.name, name)
    assert.equal(body.headers.cookie, 'dsh=private')
    assert.equal(body.headers.authorization, undefined)
  }
  revoked = true
  assert.equal((await call('/api/settings', { headers: { cookie: 'codenflow-session=alice' } })).status, 401)
  const wsStatus = await new Promise((resolve, reject) => {
    const req = request(address + '/api/ws', { headers: { host: '127.0.0.1', origin: 'http://127.0.0.1', connection: 'Upgrade', upgrade: 'websocket' } })
    req.on('response', response => { response.resume(); resolve(response.statusCode) })
    req.on('error', reject)
    req.end()
  })
  assert.equal(wsStatus, 401)
})

test('signup confirmation page and failed template state remain recoverable', async t => {
  let created = false
  const gateway = createGateway({
    auth: { async signup(email, password) { created = email === 'new@example.com' && password.length >= 12; return undefined }, async user(id) { return id === 'alice' ? { id } : undefined } },
    origin: 'http://127.0.0.1',
    readiness: () => 'failed',
    runtime: { async get() { throw new Error('must not start a tenant') } },
  })
  const address = await listen(gateway.server)
  t.after(() => gateway.close())
  const call = (path, options = {}) => new Promise((resolve, reject) => {
    const req = request(address + path, { ...options, headers: { host: '127.0.0.1', ...options.headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })))
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
  const signup = await call('/auth/signup', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1', 'content-type': 'application/x-www-form-urlencoded' },
    body: 'email=new%40example.com&password=long-enough-password',
  })
  assert.equal(signup.status, 200)
  assert.equal(created, true)
  assert.match(await signup.text(), /Consultez votre messagerie/)
  const unavailable = await call('/workspace', { headers: { cookie: 'codenflow-session=alice' } })
  assert.equal(unavailable.status, 503)
  assert.match(await unavailable.text(), /service de création rencontre un problème/)
  assert.equal((await call('/health')).status, 200)
})

test('auth forms preserve their origin and display failures without granting a session', async t => {
  let attempts = 0
  const gateway = createGateway({
    auth: {
      async user() { return undefined },
      async login() { attempts++; throw new Error('INVALID_LOGIN') },
      async signup() { attempts++; throw new Error('SIGNUP_FAILED') },
    },
    origin: 'http://127.0.0.1',
    runtime: { async get() { throw new Error('must not start a tenant') } },
  })
  const address = await listen(gateway.server)
  t.after(() => gateway.close())
  const call = (path, options = {}) => new Promise((resolve, reject) => {
    const req = request(address + path, { ...options, headers: { host: '127.0.0.1', ...options.headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })))
    })
    req.once('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
  for (const path of ['/auth', '/auth?mode=signup']) {
    const page = await call(path)
    assert.equal(page.status, 200)
    assert.equal(page.headers.get('referrer-policy'), 'same-origin')
    assert.match(await page.text(), /<form method="post" action="\/auth\//)
  }
  const headers = { origin: 'http://127.0.0.1', 'content-type': 'application/x-www-form-urlencoded' }
  for (const [path, notice] of [['/auth/login', /Connexion impossible/], ['/auth/signup', /Inscription indisponible/]]) {
    const response = await call(path, { method: 'POST', headers, body: 'email=person%40example.invalid&password=long-enough-password' })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.match(await response.text(), notice)
  }
  const invalid = await call('/auth/signup', { method: 'POST', headers, body: 'email=bad&password=short' })
  assert.equal(invalid.status, 200)
  assert.equal(invalid.headers.get('set-cookie'), null)
  assert.match(await invalid.text(), /Vérifiez votre adresse email/)
  for (const rejectedOrigin of [undefined, 'null', 'https://outside.invalid']) {
    const response = await call('/auth/signup', {
      method: 'POST',
      headers: { 'content-type': headers['content-type'], ...(rejectedOrigin === undefined ? {} : { origin: rejectedOrigin }) },
      body: 'email=person%40example.invalid&password=long-enough-password',
    })
    assert.equal(response.status, 403)
    assert.equal(response.headers.get('set-cookie'), null)
  }
  assert.equal(attempts, 2)
  assert.equal((await call('/api/settings')).status, 401)
})

test('an open response renews the prepared runtime and continues forwarding', async t => {
  let backendResponse
  const backend = createServer((req, res) => {
    backendResponse = res
    res.write('started')
  })
  const target = await listen(backend)
  t.after(() => new Promise(resolve => { backend.closeAllConnections(); backend.close(resolve) }))
  let renewals = 0
  const runtime = deferredRuntime(() => ({
    async get(id) { assert.equal(id, 'alice'); return { target, headers: {} } },
    async renew(id) { assert.equal(id, 'alice'); renewals++ },
  }))
  const gateway = createGateway({
    auth: { async user(id) { return id === 'alice' ? { id } : undefined } },
    origin: 'http://127.0.0.1', runtime,
  })
  const address = await listen(gateway.server)
  t.after(() => gateway.close())
  t.mock.timers.enable({ apis: ['setInterval'] })
  try {
    const response = await new Promise((resolve, reject) => {
      const req = request(address + '/stream', { headers: { host: '127.0.0.1', cookie: 'codenflow-session=alice' } }, res => {
        res.once('error', reject)
        res.once('data', () => resolve(res))
      })
      req.once('error', reject)
      req.end()
    })
    t.mock.timers.tick(2 * 60 * 1000)
    assert.equal(renewals, 1)
    assert.equal(response.destroyed, false)
    const nextChunk = once(response, 'data')
    backendResponse.write('still-active')
    assert.equal((await nextChunk)[0].toString(), 'still-active')
    const ended = once(response, 'end')
    backendResponse.end()
    await ended
    t.mock.timers.tick(2 * 60 * 1000)
    assert.equal(renewals, 1)
  } finally {
    t.mock.timers.reset()
  }
})

test('sandbox admission coalesces startup, preserves ownership and stops at prepaid quota', async () => {
  const owners = new Map()
  let reserved = 0
  let created = 0
  const store = { tenant: id => owners.get(id), tenantRecord: id => owners.has(id) ? { sandbox_id: owners.get(id) } : undefined, setTenant: (id, sandbox) => owners.set(id, sandbox), setTenantCookie() {}, reserve(seconds) { reserved += seconds; return reserved <= CHARGED_SECONDS * 2 } }
  const sdk = { async create(template, options) {
    assert.equal(options.network.allowPublicTraffic, false)
    assert.equal(options.lifecycle.autoResume, false)
    assert.equal(options.envs, undefined)
    created++
    const sandboxId = options.metadata.codenflow_user
    return { sandboxId, trafficAccessToken: 'private', getHost: () => `${sandboxId}.example`, files: { read: async () => `https://${sandboxId}.example/?token=launch` } }
  } }
  const fetcher = async url => new URL(url).pathname === '/health' ? new Response('ok') : new Response(null, { status: 302, headers: { 'set-cookie': 'dsh=secret; HttpOnly' } })
  const runtime = runtimeService(store, 'template', { sdk, fetcher })
  const [first, second] = await Promise.all([runtime.get('alice'), runtime.get('alice')])
  assert.equal(created, 1)
  assert.equal(first.target, second.target)
  assert.notEqual((await runtime.get('bob')).target, first.target)
  await assert.rejects(runtime.get('carol'), /BUDGET_EXHAUSTED/)
  assert.equal(created, 2)
  const wrongOwner = runtimeService({ ...store, tenant: () => 'someone-else' }, 'template', { sdk: { getInfo: async () => ({ metadata: { codenflow_user: 'bob' } }) } })
  await assert.rejects(wrongOwner.get('alice'), /RUNTIME_OWNERSHIP/)
})
