import { z } from 'zod'
import { accountIdSchema, assetIdSchema, chainIdSchema } from './caip.js'

/**
 * What the user asked for, as the agent expressed it.
 *
 * These are the MCP tool inputs and the stored intent — one definition, so a
 * tool cannot accept something the plan engine will not understand.
 *
 * The agent handles conversation; there is no natural-language parsing here.
 * Tools take typed arguments, which is what keeps a misread instruction a
 * validation error rather than a wrong transaction.
 */

/**
 * Base-unit integer as a decimal string. Never a number: 10^18 wei exceeds
 * Number.MAX_SAFE_INTEGER, and a float would silently lose precision on an
 * amount someone is about to sign.
 */
export const amountSchema = z
  .string()
  .regex(/^[0-9]+$/, 'expected an integer amount in base units, as a string')
  .refine((s) => s.length <= 78, 'amount is implausibly large')

/** Basis points, so 50 = 0.5%. Capped because a wide slippage is a real loss. */
export const slippageBpsSchema = z.number().int().min(1).max(500)

const base = {
  /**
   * Optional. When absent the scorer picks an account and states why — that is
   * the product. When present the user has overridden it.
   */
  fromAccount: accountIdSchema.optional(),
}

export const transferIntentSchema = z.object({
  ...base,
  kind: z.literal('transfer'),
  asset: assetIdSchema,
  amount: amountSchema,
  to: accountIdSchema,
})

export const swapIntentSchema = z.object({
  ...base,
  kind: z.literal('swap'),
  from: assetIdSchema,
  to: assetIdSchema,
  /** Exactly one side is fixed; the other is what the quote determines. */
  amountIn: amountSchema.optional(),
  amountOut: amountSchema.optional(),
  slippageBps: slippageBpsSchema.optional(),
}).refine(
  (v) => (v.amountIn === undefined) !== (v.amountOut === undefined),
  { message: 'give exactly one of amountIn or amountOut' },
)

/** Stretch capabilities. Defined now so the plan format does not change later. */
export const bridgeIntentSchema = z.object({
  ...base,
  kind: z.literal('bridge'),
  asset: assetIdSchema,
  amount: amountSchema,
  toChain: chainIdSchema,
})

export const supplyIntentSchema = z.object({
  ...base,
  kind: z.literal('supply'),
  asset: assetIdSchema,
  amount: amountSchema,
  protocol: z.string().min(1),
})

export const intentSchema = z.union([
  transferIntentSchema,
  swapIntentSchema,
  bridgeIntentSchema,
  supplyIntentSchema,
])

export type TransferIntent = z.infer<typeof transferIntentSchema>
export type SwapIntent = z.infer<typeof swapIntentSchema>
export type BridgeIntent = z.infer<typeof bridgeIntentSchema>
export type SupplyIntent = z.infer<typeof supplyIntentSchema>
export type Intent = z.infer<typeof intentSchema>
