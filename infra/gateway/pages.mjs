/** Minimal authentication views matching the existing dark workbench. */
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const shell = (title, content) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} · Coden flow</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#141414;color:#eee}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:100%;max-width:416px;padding:32px;background:#202020;border:1px solid #444;border-radius:16px}h1{font-size:24px;line-height:32px;margin:0 0 24px}p{color:#b7bbc2;line-height:24px;text-wrap:pretty}label{display:block;font-size:14px;margin:24px 0 8px}input,button{font:inherit;width:100%;border:1px solid #555;border-radius:8px;padding:12px;background:#2c2c2c;color:#eee}button{margin-top:24px;background:#44474d;font-weight:600;cursor:pointer}button:hover{background:#555961}button:active{transform:translateY(1px)}input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #94b4f3;outline-offset:4px}a{color:#b5cbf5}small{display:block;margin-top:8px;color:#bbb}.notice{padding:12px;border:1px solid #616975;border-radius:8px}.brand{font-weight:600;color:#ddd;margin:0 0 32px}a.back{display:inline-block;margin-top:24px}
</style></head><body><main><p class="brand">Coden flow</p>${content}</main></body></html>`

/** Render a login or signup form without external assets, scripts, or credentials. */
export function authPage(signup = false, notice = '') {
  const title = signup ? 'Créer un compte' : 'Se connecter'
  return shell(title, `<h1>${title}</h1>${notice ? `<p class="notice" role="status">${escape(notice)}</p>` : '<p>Retrouvez vos projets dans votre espace personnel.</p>'}<form method="post" action="/auth/${signup ? 'signup' : 'login'}"><label for="email">Adresse email</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="12"' : ''} maxlength="1024" required>${signup ? '<small>12 caractères minimum.</small>' : ''}<button type="submit">${title}</button></form><a class="back" href="/auth${signup ? '' : '?mode=signup'}">${signup ? 'Déjà un compte ? Se connecter' : 'Créer un compte'}</a><script nonce="<!--nonce-->" src="/auth/callback.js" defer></script>`)
}

/** Render a recoverable runtime error or a signed-in account view. */
export function messagePage(title, message, signedIn = false) {
  return shell(title, `<h1>${escape(title)}</h1><p role="status">${escape(message)}</p><a class="back" href="/">Revenir à mon espace</a>${signedIn ? '<form action="/auth/logout" method="post"><button type="submit">Se déconnecter</button></form>' : ''}`)
}

/** Keep the signed-in user informed while the private runtime starts automatically. */
export function startupPage() {
  return shell('Ouverture de votre espace', `<h1>Ouverture de votre espace</h1><p id="startup-message" role="status" aria-live="polite">Nous préparons votre espace personnel. Il s’ouvrira automatiquement.</p><p id="startup-detail"><small>Préparation en cours…</small></p><button id="startup-retry" type="button" hidden>Réessayer</button><noscript><p>JavaScript est désactivé. <a href="/">Ouvrir mon espace</a></p></noscript><script nonce="<!--nonce-->" src="/auth/startup.js" defer></script>`)
}
