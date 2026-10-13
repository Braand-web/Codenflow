/** Supabase verifies identity; opaque HttpOnly cookies identify local sessions. */
import { createClient } from '@supabase/supabase-js'

export const COOKIE = '__Host-codenflow-session'

/** Parse only the gateway cookie and reject duplicate values. */
export function sessionId(header = '', secure = true) {
  const name = secure ? COOKIE : 'codenflow-session'
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`))
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined
}

/** Issue or remove a host-only session cookie. */
export function sessionCookie(id, secure = true) {
  return `${secure ? COOKIE : 'codenflow-session'}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${id ? 604800 : 0}${secure ? '; Secure' : ''}`
}

/** Create an auth adapter without browser storage or a service-role key. */
export function authService(url, key, store, origin = undefined) {
  const client = () => createClient(url, key, { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const pending = new Map()
  return {
    async login(email, password) {
      const { data, error } = await client().auth.signInWithPassword({ email, password })
      if (error || !data.session || !data.user || data.user.is_anonymous) throw new Error('INVALID_LOGIN')
      return store.createSession(data.user, data.session)
    },
    async signup(email, password) {
      const { data, error } = await client().auth.signUp({ email, password, options: origin ? { emailRedirectTo: origin } : undefined })
      if (error) throw new Error('SIGNUP_FAILED')
      return data.session && data.user ? store.createSession(data.user, data.session) : undefined
    },
    async exchange(access, refresh, expiresAt) {
      const { data, error } = await client().auth.getUser(access)
      if (error || !data.user || data.user.is_anonymous) throw new Error('INVALID_CALLBACK')
      return store.createSession(data.user, { access_token: access, refresh_token: refresh, expires_at: expiresAt })
    },
    async user(id) {
      if (!id) return undefined
      if (pending.has(id)) return pending.get(id)
      const operation = (async () => {
        const session = store.session(id)
        if (!session) return undefined
        let access = session.access
        if (session.expires < Date.now() + 60_000) {
          const { data, error } = await client().auth.refreshSession({ refresh_token: session.refresh })
          if (error || !data.session || data.user?.id !== session.user_id) {
            store.deleteSession(id)
            return undefined
          }
          store.updateSession(id, data.session)
          access = data.session.access_token
        }
        const { data, error } = await client().auth.getUser(access)
        if (error || data.user?.id !== session.user_id || data.user?.is_anonymous) return undefined
        return { id: data.user.id }
      })()
      pending.set(id, operation)
      try { return await operation } finally { pending.delete(id) }
    },
    logout(id) { if (id) store.deleteSession(id) },
  }
}
