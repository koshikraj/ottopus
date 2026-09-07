import { Hono } from 'hono'
import { createPrivyVerifier, requireSession } from '../auth/index.js'
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
 */
const ready = Boolean(config.privyAppId && config.privyVerificationKey && config.databaseUrl)

if (ready) {
  const session = requireSession({
    verify: createPrivyVerifier({
      appId: config.privyAppId!,
      verificationKey: config.privyVerificationKey!,
    }),
    db: getDb(config.databaseUrl!),
  })

  /**
   * Who the caller is. The web app calls this once after sign-in to turn a
   * Privy session into an Ottopus user, which is also what creates the row on
   * a first ever sign-in.
   */
  apiApp.get('/me', session, (c) =>
    c.json({ userId: c.get('userId'), privyDid: c.get('privyDid') }),
  )
} else {
  apiApp.get('/me', (c) =>
    c.json(
      {
        error: 'not_configured',
        detail: 'PRIVY_APP_ID, PRIVY_JWT_VERIFICATION_KEY and DATABASE_URL must all be set.',
      },
      503,
    ),
  )
}
