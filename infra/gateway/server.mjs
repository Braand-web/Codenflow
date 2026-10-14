/** Railway entry point. Tenant code only runs in E2B, never in this process. */
import { resolve } from 'node:path'
import { openStore } from './store.mjs'
import { authService } from './auth.mjs'
import { runtimeService, deferredRuntime } from './runtime.mjs'
import { createGateway } from './app.mjs'
import { prepareTemplate } from './template.mjs'

const origin = process.env.CODENFLOW_ORIGIN ?? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error('A valid HTTPS public origin is required')
if (process.env.SUPABASE_URL !== 'https://thtknxjmzpceqwegoobj.supabase.co') throw new Error('Unexpected Supabase project')
if (!process.env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw new Error('Supabase publishable key required')
if (!process.env.E2B_API_KEY) throw new Error('E2B API key required')
if (process.env.CODENFLOW_E2B_ENABLED !== 'true') throw new Error('Configure provider spending limits before enabling E2B')
const directory = resolve(process.env.CODENFLOW_GATEWAY_DATA ?? '/data/gateway')
const store = openStore(directory)
const auth = authService(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, store, origin)
let runtime
let templateStatus = 'preparing'
const gateway = createGateway({ auth, origin, readiness: () => templateStatus, runtime: deferredRuntime(() => runtime) })
gateway.server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () => console.log('codenflow_gateway_listening'))
try {
  runtime = runtimeService(store, process.env.CODENFLOW_E2B_TEMPLATE ?? await prepareTemplate(directory))
  templateStatus = 'ready'
} catch (error) {
  templateStatus = 'failed'
  console.error('codenflow_startup_failed', error.message)
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void gateway.close().then(() => { store.close(); process.exit(0) }, () => process.exit(1))
})
