'use client'

import { useIdentityToken, usePrivy } from '@privy-io/react-auth'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { establishSession, type SessionUser } from '@/lib/api'

export type SessionState =
  | { status: 'signed-out' }
  | { status: 'establishing' }
  | { status: 'ready'; user: SessionUser }
  /** Signed in with Privy, but the service could not be reached or agreed. */
  | { status: 'failed'; reason: 'unreachable' | 'unconfigured' | 'rejected' }

const SessionContext = createContext<SessionState>({ status: 'signed-out' })

/** The Ottopus user behind the Privy session, once the service has confirmed one. */
export function useSession(): SessionState {
  return useContext(SessionContext)
}

/**
 * Turns a Privy session into an Ottopus user.
 *
 * This is the step that creates the database row. Privy signing someone in
 * happens entirely in the browser — nothing reaches Postgres until something
 * calls the service, and this is that call. Without it, a person can sign in,
 * see the app, and have no row to hang a wallet or a plan off.
 *
 * It runs once per cold boot rather than once per sign-in, because a returning
 * visitor with a live token never signs in again and would otherwise never be
 * created. The call is an idempotent upsert, so repeating it costs one query.
 *
 * A failure here does not sign anyone out. The session is real; it is our
 * service that is unavailable, and the shell says so rather than bouncing
 * someone back to a login form that would work fine.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const { identityToken } = useIdentityToken()
  // Only the result of the exchange is state. Being signed out is not a thing
  // that happens to this component — it is what Privy already says.
  const [established, setEstablished] = useState<SessionState | null>(null)

  // Establishing twice in development's double-effect would be harmless but
  // wasteful, and it makes the network tab lie about what the app does.
  const establishedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      establishedFor.current = null
      return
    }

    let cancelled = false

    void (async () => {
      const accessToken = await getAccessToken()
      if (!accessToken || cancelled) return
      if (establishedFor.current === accessToken) return
      establishedFor.current = accessToken

      setEstablished({ status: 'establishing' })
      try {
        const { user } = await establishSession({ accessToken, identityToken })
        if (!cancelled) setEstablished({ status: 'ready', user })
      } catch (error) {
        if (cancelled) return
        const status = (error as { status?: number }).status
        setEstablished({
          status: 'failed',
          reason: status === 503 ? 'unconfigured' : status === 401 ? 'rejected' : 'unreachable',
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ready, authenticated, getAccessToken, identityToken])

  const state: SessionState =
    !ready || !authenticated ? { status: 'signed-out' } : (established ?? { status: 'establishing' })

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}
