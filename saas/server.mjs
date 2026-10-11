/** Cordis portal plugin. This profile exposes no agent, shell or host RPC. */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'codenflow-portal'
const dist = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

/** Return public connection settings; privileged provider keys never enter it. */
export function publicConfig(env = process.env) {
  const url = env.SUPABASE_URL
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) throw new Error('Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.')
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS.')
  if (!publishableKey.startsWith('sb_publishable_')) throw new Error('Use a Supabase publishable key; secret and service_role keys are forbidden here.')
  return { supabaseUrl: parsed.origin, supabasePublishableKey: publishableKey }
}

/** Serve the portal and public configuration with no filesystem escape. */
export function handler(config, directory = dist) {
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return }
    let path
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://portal').pathname) }
    catch { res.writeHead(400); res.end(); return }
    if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.method === 'HEAD' ? undefined : '{"status":"ok","service":"codenflow"}'); return }
    if (path === '/api/config') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(config)); return }
    const file = path === '/' ? resolve(directory, 'index.html') : resolve(directory, '.' + path)
    if (!file.startsWith(directory + sep) || path.includes('\\') || path.includes('\0')) { res.writeHead(403); res.end(); return }
    try {
      const data = await readFile(file)
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
      res.end(req.method === 'HEAD' ? undefined : data)
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR') console.error('Portal asset read failed:', error.code)
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : 'Coden flow — page introuvable.')
    }
  }
}

/** Mount one HTTP listener as a reversible Cordis effect. */
export function apply(ctx) {
  const config = publicConfig()
  const port = Number(process.env.PORT ?? 3090)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.')
  ctx.effect(async () => {
    const server = createServer((req, res) => {
      handler(config)(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end() })
    })
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, process.env.CODENFLOW_HOST ?? '127.0.0.1', accept) })
    console.log(`Coden flow portal ready on port ${port}`)
    return async () => { server.closeAllConnections(); await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())) }
  })
}
