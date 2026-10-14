/** Progressively open the original workbench after authenticated private startup. */
const message = document.getElementById('startup-message')
const detail = document.getElementById('startup-detail')
const retry = document.getElementById('startup-retry')
let started = Date.now()
let checking = false
async function check() {
  if (checking) return
  checking = true
  retry.hidden = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 110000)
  try {
    const response = await fetch('/auth/readiness', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
    const { state } = await response.json()
    if (response.status === 401) { location.replace('/auth'); return }
    if (state === 'ready' && response.ok) { location.replace('/'); return }
    if (state === 'preparing' && response.ok) {
      if (Date.now() - started > 60000) message.textContent = 'Le démarrage prend plus de temps que prévu. Votre espace s’ouvrira automatiquement.'
      setTimeout(check, 5000)
      return
    }
    message.textContent = state === 'quota' ? 'Le quota d’exécution est atteint. Vos projets sont conservés.' : 'Votre espace ne peut pas s’ouvrir pour le moment. Réessayez dans quelques instants.'
    detail.textContent = ''
    retry.hidden = false
  } catch {
    message.textContent = 'La connexion a été interrompue. Vérifiez votre connexion, puis réessayez.'
    detail.textContent = ''
    retry.hidden = false
  } finally {
    clearTimeout(timeout)
    checking = false
  }
}
retry.addEventListener('click', () => {
  started = Date.now()
  message.textContent = 'Nous préparons votre espace personnel. Il s’ouvrira automatiquement.'
  detail.textContent = 'Préparation en cours…'
  void check()
})
void check()
