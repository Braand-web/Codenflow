import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import './style.css'

type Project = { id: string; name: string; brief: string; created_at: string }
type Config = { supabaseUrl: string; supabasePublishableKey: string }
type Mode = 'login' | 'signup' | 'reset' | 'recovery'

function Brand() {
  return <a className="brand" href="/" aria-label="Coden flow, accueil"><img src="/favicon.svg" alt="" width="32" height="32" /><span>Coden <span className="muted">flow</span></span></a>
}

function App({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [selected, setSelected] = useState<Project | null>(null)
  const owner = useRef<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return
      if (owner.current !== next?.user.id) {
        setProjects([])
        setSelected(null)
        setBusy(false)
      }
      owner.current = next?.user.id
      setSession(next)
      setReady(true)
      if (event === 'PASSWORD_RECOVERY') setMode('recovery')
      if (event === 'SIGNED_OUT') setMode('login')
    })
    client.auth.getSession().then(({ data, error: issue }) => {
      if (!active) return
      if (issue) setError('La session n’a pas pu être chargée. Rechargez la page.')
      owner.current = data.session?.user.id
      setSession(data.session)
      setReady(true)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [client])

  useEffect(() => {
    const id = session?.user.id
    if (!id) return
    let active = true
    setLoading(true)
    setLoadError('')
    client.from('codenflow_projects').select('id,name,brief,created_at').eq('owner_id', id).is('archived_at', null).order('created_at', { ascending: false })
      .then(({ data, error: issue }) => {
        if (!active) return
        setLoading(false)
        if (issue) { setLoadError('Impossible de charger vos projets. Réessayez en rechargeant la page.'); return }
        setProjects(data ?? [])
      })
    return () => { active = false }
  }, [session?.user.id, client])

  function changeMode(next: Mode) { setMode(next); setPassword(''); setNotice(''); setError('') }

  async function authenticate(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'reset') {
        const { error: issue } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' })
        if (issue) throw issue
        setNotice('Si ce compte existe, un lien de réinitialisation a été envoyé.')
      } else if (mode === 'recovery') {
        const { error: issue } = await client.auth.updateUser({ password })
        if (issue) throw issue
        setPassword(''); setMode('login'); setNotice('Votre mot de passe a été mis à jour.')
      } else if (mode === 'signup') {
        const { error: issue } = await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/' } })
        if (issue) throw issue
        setPassword(''); setNotice('Consultez votre messagerie pour confirmer votre adresse et ouvrir votre espace.')
      } else {
        const { error: issue } = await client.auth.signInWithPassword({ email, password })
        if (issue) throw issue
        setPassword('')
      }
    } catch (issue) {
      const code = issue && typeof issue === 'object' && 'code' in issue ? issue.code : ''
      setError(code === 'invalid_credentials' ? 'Adresse ou mot de passe incorrect.'
        : code === 'email_not_confirmed' ? 'Confirmez votre adresse email avant de vous connecter.'
        : code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' ? 'Trop de tentatives. Patientez quelques minutes.'
        : code === 'weak_password' ? 'Choisissez un mot de passe plus robuste.'
        : 'Cette opération a échoué. Vérifiez votre connexion et réessayez.')
    } finally { setBusy(false) }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault()
    const id = session?.user.id
    if (!id) return
    setBusy(true); setError(''); setNotice('')
    const { data, error: issue } = await client.from('codenflow_projects')
      .insert({ owner_id: id, name: name.trim(), brief: brief.trim() }).select('id,name,brief,created_at').single()
    if (owner.current !== id) return
    setBusy(false)
    if (issue) { setError('Le projet n’a pas pu être enregistré. Réessayez.'); return }
    setProjects(rows => [data, ...rows]); setName(''); setBrief(''); setSelected(data)
    setNotice('Projet enregistré dans votre espace privé.')
  }

  async function signOut() {
    setBusy(true); setError('')
    const { error: issue } = await client.auth.signOut()
    setBusy(false)
    if (issue) setError('La déconnexion a échoué. Réessayez.')
  }

  const messages = <>{error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message success" role="status">{notice}</p>}</>
  return <><a className="skip" href="#main">Aller au contenu</a><header><Brand /><span className="tag">Accès anticipé</span>{session && <button className="quiet" onClick={signOut} disabled={busy}>Se déconnecter</button>}</header>
    {!ready ? <main id="main" className="center"><div className="skeleton" role="status" aria-label="Chargement de votre espace" /></main>
    : (!session || mode === 'recovery') ? <main id="main" className="auth-layout"><section className="intro"><p className="eyebrow">VOTRE PROCHAIN PROJET COMMENCE ICI</p><h1>De l’idée<br />à la création.</h1><p>Un espace pour organiser vos projets et construire avec l’intelligence artificielle.</p><div className="preview-note"><span className="dot" /><p>La plateforme se prépare. Créez votre compte et enregistrez votre premier projet.</p></div></section><section className="auth-card" aria-labelledby="auth-title"><p className="eyebrow">CODEN FLOW</p><h2 id="auth-title">{mode === 'signup' ? 'Créez votre espace' : mode === 'reset' ? 'Retrouvez votre accès' : mode === 'recovery' ? 'Nouveau mot de passe' : 'Content de vous retrouver'}</h2><p className="muted">{mode === 'signup' ? 'Votre compte et vos projets vous appartiennent.' : mode === 'reset' ? 'Recevez un lien par email.' : mode === 'recovery' ? 'Choisissez au moins 12 caractères.' : 'Connectez vous à votre espace privé.'}</p><form onSubmit={authenticate}>{mode !== 'recovery' && <label>Adresse email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="vous@exemple.com" /></label>}{mode !== 'reset' && <label>Mot de passe<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} required value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Votre mot de passe' : '12 caractères minimum'} /></label>}{messages}<button className="primary" disabled={busy}>{busy ? 'Veuillez patienter…' : mode === 'signup' ? 'Créer mon compte' : mode === 'reset' ? 'Envoyer le lien' : mode === 'recovery' ? 'Enregistrer' : 'Se connecter'}</button></form><div className="auth-links">{mode === 'login' ? <><button className="link" onClick={() => changeMode('reset')}>Mot de passe oublié ?</button><p>Pas encore de compte ? <button className="link" onClick={() => changeMode('signup')}>Créer un compte</button></p></> : <button className="link" onClick={() => changeMode('login')}>Revenir à la connexion</button>}</div><p className="small muted">Les fonctions IA et les offres payantes seront ouvertes après la phase de préparation.</p></section></main>
    : <main id="main" className="workspace"><section className="workspace-heading"><div><p className="eyebrow">VOTRE ESPACE PRIVÉ</p><h1>Vos projets</h1><p className="muted">{session.user.email}</p></div><span className="tag">{projects.length} projet{projects.length > 1 ? 's' : ''}</span></section>{messages}<div className="project-layout"><section className="project-create"><h2>Une nouvelle idée</h2><p className="muted">Posez les bases de votre prochain projet.</p><form onSubmit={createProject}><label>Nom du projet<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Mon application" /></label><label>Votre idée<textarea required maxLength={8000} rows={5} value={brief} onChange={event => setBrief(event.target.value)} placeholder="Décrivez ce que vous voulez créer et à qui cela servira." /></label><button className="primary" disabled={busy || !name.trim() || !brief.trim()}>{busy ? 'Enregistrement…' : 'Enregistrer le projet'}</button></form><p className="small muted">La création IA et les médias seront disponibles à la prochaine étape.</p></section><section aria-labelledby="projects-title"><h2 id="projects-title">Votre bibliothèque</h2>{loading ? <div className="skeleton" role="status" aria-label="Chargement des projets" /> : loadError ? <p className="message error" role="alert">{loadError}</p> : projects.length === 0 ? <div className="empty"><span className="empty-mark">↗</span><h3>Une page à écrire.</h3><p className="muted">Votre premier projet apparaîtra ici.</p></div> : <div className="project-list">{projects.map(project => <button key={project.id} className={'project' + (selected?.id === project.id ? ' selected' : '')} onClick={() => setSelected(project)}><span><strong>{project.name}</strong><span className="small muted">{new Date(project.created_at).toLocaleDateString('fr-FR')}</span></span><p>{project.brief}</p><span className="link small">Voir le projet ↗</span></button>)}</div>}{selected && <article className="project-detail"><div className="detail-title"><h3>{selected.name}</h3><button className="quiet" onClick={() => setSelected(null)} aria-label="Fermer le détail du projet">Fermer</button></div><p>{selected.brief}</p><p className="small muted">Enregistré le {new Date(selected.created_at).toLocaleDateString('fr-FR')}.</p></article>}</section></div></main>}
    <footer><span>© {new Date().getFullYear()} Coden flow</span><span>Préversion · Comptes et projets privés</span></footer></>
}

const root = createRoot(document.getElementById('root')!)
fetch('/api/config').then(async response => {
  if (!response.ok) throw new Error('Configuration indisponible')
  const config: Config = await response.json()
  if (!config.supabaseUrl || !config.supabasePublishableKey?.startsWith('sb_publishable_')) throw new Error('Configuration invalide')
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  root.render(<App client={client} />)
}).catch(() => root.render(<><header><Brand /></header><main className="center"><h1>L’espace se prépare.</h1><p role="alert">La connexion à Coden flow est momentanément indisponible. Rechargez la page dans quelques instants.</p><button className="primary" onClick={() => window.location.reload()}>Réessayer</button></main></>))
