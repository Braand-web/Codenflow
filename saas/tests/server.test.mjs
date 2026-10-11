import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handler, publicConfig } from '../server.mjs'

test('public config rejects privileged keys and excludes internal provider secrets', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', OPENROUTER_API_KEY: 'private', FAL_KEY: 'private', E2B_API_KEY: 'private' }
  assert.deepEqual(publicConfig(env), { supabaseUrl: env.SUPABASE_URL, supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY })
  for (const key of ['sb_secret_example', 'eyJservice_role', '']) assert.throws(() => publicConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: key }))
  assert.throws(() => publicConfig({ ...env, SUPABASE_URL: 'http://example.supabase.co' }))
})

test('portal routes serve assets and reject traversal, host RPC and mutations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codenflow-portal-'))
  const dispatch = handler({ supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_example' }, directory)
  await writeFile(join(directory, 'index.html'), '<title>Coden flow</title>')
  const server = createServer((req, res) => { void dispatch(req, res) })
  await new Promise(accept => server.listen(0, '127.0.0.1', accept))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const home = await fetch(url)
    assert.equal(home.status, 200)
    assert.match(await home.text(), /Coden flow/)
    assert.equal(home.headers.get('x-frame-options'), 'DENY')
    assert.equal((await fetch(url + '/health')).status, 200)
    assert.equal((await fetch(url + '/api/config')).status, 200)
    for (const path of ['/api', '/api/stream', '/.env', '/%2e%2e%2fsecret', '/%5c..%5csecret']) assert.ok((await fetch(url + path)).status >= 400, path)
    assert.equal((await fetch(url + '/', { method: 'POST' })).status, 405)
    assert.equal((await fetch(url + '/', { method: 'HEAD' })).status, 200)
  } finally {
    server.closeAllConnections()
    await new Promise(accept => server.close(accept))
    await rm(directory, { recursive: true, force: true })
  }
})
