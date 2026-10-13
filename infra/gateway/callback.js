const params = new URLSearchParams(window.location.hash.slice(1))
const accessToken = params.get('access_token')
const refreshToken = params.get('refresh_token')
const status = document.querySelector('[role="status"]')
if (accessToken && refreshToken) {
  const expiresAt = Number(params.get('expires_at') ?? Math.floor(Date.now() / 1000) + Number(params.get('expires_in') ?? 3600))
  history.replaceState(null, '', window.location.pathname + window.location.search)
  fetch('/auth/exchange', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt }),
  }).then(response => {
    if (!response.ok) throw new Error('SESSION_EXCHANGE_FAILED')
    location.replace('/')
  }).catch(() => {
    if (status) status.textContent = 'La confirmation a échoué. Recommencez la connexion.'
  })
}
