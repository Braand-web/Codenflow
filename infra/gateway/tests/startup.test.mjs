import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { runInNewContext } from 'node:vm'
import { createGateway } from '../app.mjs'

test('startup stays visible and only prepares the authenticated owner before opening the workbench', async t => {
  const backend = createServer((req, res) => res.end('original-workbench'))
  backend.listen(0, '127.0.0.1')
  await once(backend, 'listening')
  t.after(() => new Promise(resolve => backend.close(resolve)))
  let state = 'preparing'
  let prepared = false
  let starts = 0
  const gateway = createGateway({
    origin: 'http://127.0.0.1', readiness: () => state,
    auth: { async user(id) { return id === 'alice' ? { id } : undefined } },
    runtime: {
      isReady: () => prepared,
      async get(id) { assert.equal(id, 'alice'); starts++; prepared = true; return { target: `http://127.0.0.1:${backend.address().port}`, headers: {} } },
    },
  })
  gateway.server.listen(0, '127.0.0.1')
  await once(gateway.server, 'listening')
  t.after(() => gateway.close())
  const call = (path, cookie = 'alice') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: gateway.server.address().port, path, headers: { host: '127.0.0.1', cookie: `codenflow-session=${cookie}` } }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
  const page = await call('/')
  assert.equal(page.status, 200)
  assert.match(page.body, /s’ouvrira automatiquement/)
  assert.match(page.body, /src="\/auth\/startup.js"/)
  assert.doesNotMatch(page.body, /Actualisez cette page|Revenir à mon espace/)
  assert.match(page.headers['content-security-policy'], /script-src 'nonce-/)
  assert.equal(JSON.parse((await call('/auth/readiness')).body).state, 'preparing')
  assert.equal((await call('/auth/readiness', 'forged')).status, 401)
  assert.equal(starts, 0)
  state = 'ready'
  assert.match((await call('/')).body, /s’ouvrira automatiquement/)
  assert.equal(starts, 0)
  assert.equal(JSON.parse((await call('/auth/readiness?userId=bob')).body).state, 'ready')
  assert.equal((await call('/')).body, 'original-workbench')
  state = 'failed'
  assert.equal((await call('/')).status, 200)
  assert.equal(JSON.parse((await call('/auth/readiness')).body).state, 'failed')
})

test('startup script polls without reloads, opens when ready and offers recovery on failure', async () => {
  const script = await readFile(new URL('../startup.js', import.meta.url), 'utf8')
  const elements = Object.fromEntries(['startup-message', 'startup-detail', 'startup-retry'].map(id => [id, { hidden: true, textContent: '', addEventListener(type, callback) { this.click = callback } }]))
  const timers = new Map()
  let nextTimer = 0
  let state = 'preparing'
  const destinations = []
  runInNewContext(script, {
    document: { getElementById: id => elements[id] }, Date, AbortController,
    setTimeout(callback, ms) { const id = ++nextTimer; timers.set(id, { callback, ms }); return id },
    clearTimeout: id => timers.delete(id),
    async fetch(path, options) { assert.equal(path, '/auth/readiness'); assert.equal(options.credentials, 'same-origin'); return { ok: true, status: 200, json: async () => ({ state }) } },
    location: { replace: path => destinations.push(path) },
  })
  const settle = () => new Promise(resolve => setImmediate(resolve))
  await settle()
  assert.deepEqual(destinations, [])
  assert.equal(timers.size, 1)
  const [timerId, poll] = [...timers][0]
  assert.equal(poll.ms, 5000)
  timers.delete(timerId)
  state = 'failed'
  poll.callback()
  await settle()
  assert.equal(timers.size, 0)
  assert.equal(elements['startup-retry'].hidden, false)
  assert.match(elements['startup-message'].textContent, /ne peut pas s’ouvrir/)
  state = 'ready'
  elements['startup-retry'].click()
  await settle()
  assert.deepEqual(destinations, ['/'])
  assert.equal(timers.size, 0)
})
