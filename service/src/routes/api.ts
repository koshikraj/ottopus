import { Hono, type Context } from 'hono'
import { createPrivyAuth, keyProblem, requireSession } from '../auth/index.js'
import { config } from '../config.js'
import { getDb } from '../db/client.js'

/**
 * Web-facing surface. Mounted at the root of api.ottopus.xyz in production,
 * and at /api everywhere.
 *
 * The browser holds no Supabase key, so this is the only path the web app has
 * to data. Authenticated by Privy session, unlike the MCP surface.
 */
export const apiApp = new Hono()

apiApp.get('/health', (c) => c.json({ ok: true, surface: 'api' }))

/**
 * Sign-in needs three values wired up. Without them the authenticated routes
 * answer 503 rather than 401: "not configured" and "not signed in" are
 * different problems, and returning 401 here would send someone to fix their
 * session when the deployment is what is missing.
 *
 * The key is checked for shape, not just presence — a truncated PEM is present
 * and useless, and it would otherwise fail as a 401 on every request.
 */
const missing: string[] = []
if (!config.privyAppId) missing.push('PRIVY_APP_ID is not set')
if (!config.databaseUrl) missing.push('DATABASE_URL is not set')
const keyIssue = keyProblem(config.privyVerificationKey)
if (keyIssue) missing.push(`PRIVY_JWT_VERIFICATION_KEY ${keyIssue}`)

const ready = missing.length === 0
if (!ready) console.error(`[api] sign-in disabled — ${missing.join('; ')}`)

if (ready) {
  const session = requireSession({
    auth: createPrivyAuth({
      appId: config.privyAppId!,
      verificationKey: config.privyVerificationKey!,
    }),
    db: getDb(config.databaseUrl!),
  })

  /**
   * Establish the session. The web app calls this once after signing in, and
   * this is what creates the user row on a first ever sign-in — there is no
   * separate registration step.
   *
   * POST rather than GET because it writes. An idempotent write is still a
   * write, and a GET that creates rows is one link prefetcher away from
   * creating them by accident.
   */
  apiApp.post('/session', session, (c) => c.json({ user: c.get('user') }))

  /** Who the caller is, without writing anything new. */
  apiApp.get('/me', session, (c) => c.json({ user: c.get('user') }))
} else {
  const unconfigured = (c: Context) => c.json({ error: 'not_configured', detail: missing }, 503)
  apiApp.post('/session', unconfigured)
  apiApp.get('/me', unconfigured)
}
