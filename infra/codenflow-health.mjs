/** Public readiness route for Railway's container health check. */
export const name = 'codenflow-health'
export const inject = ['webServer']

/** Register an intentionally data-free readiness endpoint. */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/health',
    handler(request, response) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD' })
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(request.method === 'HEAD' ? undefined : '{"status":"ok","service":"codenflow"}')
    },
  }), 'codenflow-health: /health route')
}
