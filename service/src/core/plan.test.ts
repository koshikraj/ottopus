import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { PLAN_STATUSES, callSchema, isTerminal, planStatusSchema } from './plan.js'

describe('status vocabulary', () => {
  /**
   * The vocabulary lives in three places: this file, the database check
   * constraint, and the canonical plan doc. Drift between them breaks MCP
   * responses, activity filters and the review UI at once, so it is checked
   * rather than trusted.
   */
  it('matches the database check constraint exactly', async () => {
    const sql = await readFile(new URL('../../drizzle/0000_base_schema.sql', import.meta.url), 'utf8')
    const clause = /plan_events_status[^(]*\(([^)]*)\)/s.exec(sql)
    expect(clause, 'plan_events_status constraint not found in the migration').toBeTruthy()
    const inDb = [...clause![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort()
    expect(inDb).toEqual([...PLAN_STATUSES].sort())
  })

  it('has no "simulated" state — simulation is evidence, not a state', () => {
    expect(PLAN_STATUSES).not.toContain('simulated')
  })

  it('has no "inked" state — that is mascot copy for cancelled', () => {
    expect(PLAN_STATUSES).not.toContain('inked')
    expect(PLAN_STATUSES).toContain('cancelled')
  })

  it('rejects a status outside the vocabulary', () => {
    expect(() => planStatusSchema.parse('simulated')).toThrow()
    expect(() => planStatusSchema.parse('reviewed')).toThrow()
  })
})

describe('terminal states', () => {
  it('treats every ending as terminal', () => {
    for (const s of ['confirmed', 'failed', 'expired', 'blocked', 'superseded', 'cancelled'] as const) {
      expect(isTerminal(s)).toBe(true)
    }
  })

  it('treats states a plan can still leave as non-terminal', () => {
    for (const s of ['draft', 'awaiting_review', 'awaiting_signature', 'submitted'] as const) {
      expect(isTerminal(s)).toBe(false)
    }
  })
})

describe('calls', () => {
  it('lowercases calldata, so comparison cannot depend on casing', () => {
    const call = callSchema.parse({
      to: 'eip155:8453:0xABCDEF0123456789abcdef0123456789ABCDEF01',
      value: '0',
      data: '0xA9059CBB',
      chainId: 'eip155:8453',
    })
    expect(call.data).toBe('0xa9059cbb')
    expect(call.to).toBe('eip155:8453:0xabcdef0123456789abcdef0123456789abcdef01')
  })

  it('rejects a value that is not an integer string', () => {
    const bad = { to: 'eip155:1:0xabc', value: '1.5', data: '0x', chainId: 'eip155:1' }
    expect(() => callSchema.parse(bad)).toThrow()
  })
})
