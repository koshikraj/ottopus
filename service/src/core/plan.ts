import { z } from 'zod'
import { accountIdSchema, chainIdSchema } from './caip.js'
import { intentSchema } from './intent.js'

/**
 * The plan format. Shape only — hashing and the state machine are separate, and
 * nothing here may be mutated once a plan reaches review.
 *
 * Mirrors the Plan type in the canonical plan doc. The status vocabulary is
 * frozen and must match the check constraint in src/db/schema.ts exactly; drift
 * between the three breaks MCP responses, activity filters and the review UI at
 * the same time.
 */

export const PLAN_STATUSES = [
  'draft',
  'awaiting_review',
  'awaiting_signature',
  'submitted',
  'confirmed',
  'failed',
  'expired',
  'blocked',
  'superseded',
  'cancelled',
] as const

export const planStatusSchema = z.enum(PLAN_STATUSES)
export type PlanStatus = z.infer<typeof planStatusSchema>

/** Statuses a plan can never leave. Nothing may be signed from one of these. */
export const TERMINAL_STATUSES = [
  'confirmed',
  'failed',
  'expired',
  'blocked',
  'superseded',
  'cancelled',
] as const satisfies readonly PlanStatus[]

export function isTerminal(status: PlanStatus): boolean {
  return (TERMINAL_STATUSES as readonly PlanStatus[]).includes(status)
}

/** 0x-prefixed hex, lowercased. Calldata compared case-sensitively is a bug. */
const hexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, 'expected 0x-prefixed hex')
  .transform((s) => s.toLowerCase())

export const callSchema = z.object({
  to: accountIdSchema,
  /** Wei as a decimal string, for the same reason amounts are strings. */
  value: z.string().regex(/^[0-9]+$/),
  data: hexSchema,
  chainId: chainIdSchema,
})

/**
 * Where the calls came from. Agent-crafted plans get a heightened policy tier
 * and a distinct badge on review — the user must be able to see that no route
 * provider stood behind this.
 */
export const provenanceSchema = z.enum(['route_provider', 'agent_crafted'])

export const warningSchema = z.object({
  severity: z.enum(['info', 'caution', 'block']),
  code: z.string().min(1),
  message: z.string().min(1),
  /** What to do instead. A warning with no alternative just induces clicking. */
  saferAlternative: z.string().optional(),
})

export const candidateSummarySchema = z.object({
  account: accountIdSchema,
  label: z.string().optional(),
  /** Why this one lost, in plain language. Shown, so it is stored. */
  reason: z.string().min(1),
})

export const resolutionSchema = z.object({
  account: z.object({ caip10: accountIdSchema, label: z.string().optional() }),
  candidatesConsidered: z.array(candidateSummarySchema),
  reason: z.string().min(1),
})

/**
 * MVP ships "calls". The other two are reserved so adding them later is not a
 * plan-format change — which would invalidate every stored planHash.
 */
export const outcomeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('calls'), calls: z.array(callSchema).min(1) }),
  z.object({ type: z.literal('signature'), eip712: z.unknown() }),
  z.object({ type: z.literal('permission'), request: z.unknown() }),
])

export const quoteSchema = z.object({
  provider: z.string().min(1),
  expiresAt: z.iso.datetime(),
  expectedOut: z.string().optional(),
  minOut: z.string().optional(),
})

export const humanPlanSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(z.string()),
  feesUsd: z.string(),
  warnings: z.array(warningSchema),
})

export const planSchema = z.object({
  id: z.uuid(),
  /** A replacement bumps this and kills the old review link. */
  version: z.number().int().positive(),
  userId: z.uuid(),
  createdVia: z.enum(['agent', 'web']),
  intent: intentSchema,
  provenance: provenanceSchema,
  resolution: resolutionSchema,
  outcome: outcomeSchema,
  quote: quoteSchema,
  humanPlan: humanPlanSchema,
  status: planStatusSchema,
  expiresAt: z.iso.datetime(),
})

export type Plan = z.infer<typeof planSchema>
export type Call = z.infer<typeof callSchema>
export type Warning = z.infer<typeof warningSchema>
export type Outcome = z.infer<typeof outcomeSchema>
