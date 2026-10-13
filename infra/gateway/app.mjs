/** Authenticate every HTTP/WS request before forwarding to a tenant microVM. */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createProxyServer } from 'http-proxy-3'
import { sessionCookie, sessionId } from './auth.mjs'
import { authPage, messagePage } from './pages.mjs'

const allowedHeaders = new Set(['accept', 'accept-language', 'content-type', 'content-length', 'range', 'if-none-match', 'if-modified-since', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions', 'upgrade', 'connection'])

/** Discard browser and proxy credentials before crossing into tenant code. */
export function backendHeaders(inbound, runtime) {
  const headers = Object.fromEntries(Object.entries(inbound).filter(([name]) => allowedHeaders.has(name)))
  return { ...headers, ...runtime.headers, host: new URL(runtime.target).host, origin: runtime.target }
}

/** Build an injectable gateway, with no public environment creation endpoints. */
export function createGateway({ auth, runtime, origin, ready = () => true, readiness = () => ready() ? 'ready' : 'preparing' }) {
  const secure = new URL(origin).protocol === 'https:'
  const proxy = createProxyServer({ changeOrigin: true, xfwd: false, followRedirects: false })
  const sockets = new Set()
  const attempts = new Map()
  const callbackScript = readFileSync(new URL('./callback.js', import.meta.url))
  const write = (res, status, html, headers = {}) => {
    const nonce = randomBytes(18).toString('base64')
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, ...headers })
    res.end(html.replaceAll('<!--nonce-->', nonce))
  }
  const redirect = (res, headers = {}) => write(res, 303, '', { location: '/', ...headers })
  const validOrigin = req => req.headers.origin === origin
  const fail = (res, error) => {
    if (res.headersSent) { res.destroy(); return }
    const quota = error.message === 'BUDGET_EXHAUSTED'
    write(res, 503, messagePage(quota ? 'Quota atteint' : 'Espace indisponible', quota ? 'Le budget mensuel d’exécution est atteint. Vos projets sont conservés.' : 'Votre espace ne peut pas démarrer pour le moment. Réessayez dans quelques instants.'), { 'retry-after': '30' })
    console.error('gateway_request_failed', /^[A-Z_]+$/.test(error.message) ? error.message : error.name)
  }
  proxy.on('proxyRes', (response, request) => {
    delete response.headers['set-cookie']
    delete response.headers['access-control-allow-origin']
    response.headers['cache-control'] = 'no-store'
    response.headers['referrer-policy'] = 'no-referrer'
    // Rebase internal redirects onto this public host without losing their path.
    if (response.headers.location && request.codenflowBackendTarget) {
      try {
        const location = new URL(response.headers.location, request.codenflowBackendTarget)
        if (location.origin === request.codenflowBackendTarget) {
          location.searchParams.delete('token')
          response.headers.location = `${location.pathname}${location.search}${location.hash}`
        }
      } catch { delete response.headers.location }
    }
  })
  const server = createServer(async (req, res) => {
    try {
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return write(res, 400, '')
      const url = new URL(req.url, origin)
      if (url.pathname === '/health' && req.method === 'GET') return write(res, 200, 'ok')
      if (req.headers.host !== new URL(origin).host) return write(res, 421, '')
      if ((req.headers.origin && !validOrigin(req)) || !['GET', 'HEAD'].includes(req.method) && !validOrigin(req)) return write(res, 403, '')
      if (url.pathname === '/auth/callback.js' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" })
        return res.end(callbackScript)
      }
      const id = sessionId(req.headers.cookie, secure)
      if (url.pathname.startsWith('/auth/') && req.method === 'POST') {
        if (url.pathname === '/auth/logout') { auth.logout(id); return redirect(res, { 'set-cookie': sessionCookie('', secure) }) }
        if (url.pathname === '/auth/exchange') {
          if (req.headers['content-type'] !== 'application/json') return write(res, 415, '')
          let body = ''
          for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 4096) return write(res, 413, '') }
          let tokens
          try { tokens = JSON.parse(body) } catch (error) { return write(res, 400, '') }
          if (typeof tokens.access_token !== 'string' || tokens.access_token.length > 4096 || typeof tokens.refresh_token !== 'string' || tokens.refresh_token.length > 4096 || !Number.isSafeInteger(tokens.expires_at) || tokens.expires_at * 1000 < Date.now()) return write(res, 400, '')
          try {
            const newId = await auth.exchange(tokens.access_token, tokens.refresh_token, tokens.expires_at)
            auth.logout(id)
            return write(res, 204, '', { 'set-cookie': sessionCookie(newId, secure) })
          } catch (error) { return write(res, 400, '') }
        }
        if (!['/auth/login', '/auth/signup'].includes(url.pathname)) return write(res, 404, '')
        const now = Date.now()
        for (const [key, value] of attempts) if (value.until < now) attempts.delete(key)
        // A bounded global limiter also works behind Railway's shared reverse-proxy IP.
        const rate = attempts.get('global') ?? { count: 0, until: now + 60000 }
        attempts.set('global', rate)
        if (++rate.count > 30) return write(res, 429, messagePage('Trop de tentatives', 'Réessayez dans une minute.'), { 'retry-after': '60' })
        if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return write(res, 415, '')
        let body = ''
        for await (const chunk of req) {
          body += chunk.toString()
          if (Buffer.byteLength(body) > 8192) return write(res, 413, '')
        }
        const form = new URLSearchParams(body)
        const email = form.get('email')?.trim()
        const password = form.get('password')
        const signup = url.pathname === '/auth/signup'
        if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 1024 || signup && password.length < 12) return write(res, 400, authPage(signup, 'Vérifiez votre adresse email et votre mot de passe.'))
        try {
          if (signup) {
            const newId = await auth.signup(email, password)
            if (newId) return redirect(res, { 'set-cookie': sessionCookie(newId, secure) })
            return write(res, 200, authPage(false, 'Consultez votre messagerie pour confirmer votre compte, puis connectez-vous.'))
          }
          const newId = await auth.login(email, password)
          auth.logout(id)
          return redirect(res, { 'set-cookie': sessionCookie(newId, secure) })
        } catch (error) {
          return write(res, 400, authPage(signup, signup ? 'Inscription indisponible. Réessayez plus tard.' : 'Connexion impossible. Vérifiez vos identifiants et la confirmation de votre email.'))
        }
      }
      const user = await auth.user(id)
      if (url.pathname === '/auth' || !user && url.pathname === '/') {
        if (req.method !== 'GET') return write(res, 405, '')
        return write(res, 200, user ? messagePage('Votre compte', 'Votre session est active.', true) : authPage(url.searchParams.get('mode') === 'signup'))
      }
      if (!user) return write(res, 401, '')
      const state = readiness()
      if (state !== 'ready') {
        const failed = state === 'failed'
        return write(res, 503, messagePage(failed ? 'Service temporairement indisponible' : 'Espace en préparation', failed ? 'Le service de création rencontre un problème. Réessayez dans quelques instants.' : 'Votre environnement personnel démarre. Actualisez cette page dans quelques instants.'), { 'retry-after': failed ? '60' : '10' })
      }
      if (url.searchParams.has('token')) return redirect(res)
      const backend = await runtime.get(user.id)
      req.codenflowBackendTarget = backend.target
      req.headers = backendHeaders(req.headers, backend)
      let refreshing = false
      const heartbeat = setInterval(() => {
        if (refreshing) return
        refreshing = true
        void runtime.renew(user.id).catch(error => {
          console.error('gateway_lease_renewal_failed', error.message)
          res.destroy()
        }).finally(() => { refreshing = false })
      }, 2 * 60 * 1000)
      heartbeat.unref()
      res.once('close', () => clearInterval(heartbeat))
      proxy.web(req, res, { target: backend.target }, error => { clearInterval(heartbeat); fail(res, error) })
    } catch (error) { fail(res, error) }
  })
  server.on('upgrade', async (req, socket, head) => {
    const reject = () => socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    try {
      if (req.headers.host !== new URL(origin).host || !validOrigin(req) || !req.url?.startsWith('/') || req.url.startsWith('//')) return reject()
      const id = sessionId(req.headers.cookie, secure)
      const user = await auth.user(id)
      if (!user) return reject()
      const backend = await runtime.get(user.id)
      req.codenflowBackendTarget = backend.target
      req.headers = backendHeaders(req.headers, backend)
      sockets.add(socket)
      // Revalidate a long-lived socket after logout, deletion, or session expiry.
      const timer = setInterval(() => {
        void auth.user(id).then(current => {
          if (!current) { socket.destroy(); return }
          return runtime.renew(user.id)
        }).catch(() => socket.destroy())
      }, 2 * 60 * 1000)
      timer.unref()
      socket.once('close', () => { clearInterval(timer); sockets.delete(socket) })
      proxy.ws(req, socket, head, { target: backend.target }, () => socket.destroy())
    } catch (error) { reject() }
  })
  server.requestTimeout = 10 * 60 * 1000
  server.headersTimeout = 15000
  return { server, async close() {
    for (const socket of sockets) socket.destroy()
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    proxy.close()
  } }
}
