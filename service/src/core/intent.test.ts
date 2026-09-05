import { describe, expect, it } from 'vitest'
import { amountSchema, swapIntentSchema, transferIntentSchema } from './intent.js'

describe('amounts', () => {
  it('takes base units as a string', () => {
    expect(amountSchema.parse('500000000')).toBe('500000000')
  })

  it('rejects a number, a float and a negative', () => {
    // 10^18 wei exceeds Number.MAX_SAFE_INTEGER, so a float would quietly lose
    // precision on an amount someone is about to sign.
    expect(() => amountSchema.parse(500 as unknown as string)).toThrow()
    expect(() => amountSchema.parse('1.5')).toThrow()
    expect(() => amountSchema.parse('-1')).toThrow()
  })
})

describe('transfer intent', () => {
  it('normalises the destination account', () => {
    const intent = transferIntentSchema.parse({
      kind: 'transfer',
      asset: 'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '500000000',
      to: 'eip155:8453:0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045',
    })
    expect(intent.to).toBe('eip155:8453:0xd8da6bf26964af9d7eed9e03e53415d37aa96045')
  })

  it('rejects a bare token symbol', () => {
    const bad = { kind: 'transfer', asset: 'USDC', amount: '1', to: 'eip155:1:0xabc' }
    expect(() => transferIntentSchema.parse(bad)).toThrow()
  })

  it('leaves fromAccount optional, so the scorer can choose', () => {
    const intent = transferIntentSchema.parse({
      kind: 'transfer',
      asset: 'eip155:1/slip44:60',
      amount: '1',
      to: 'eip155:1:0xabc',
    })
    expect(intent.fromAccount).toBeUndefined()
  })
})

describe('swap intent', () => {
  const base = { kind: 'swap', from: 'eip155:8453/slip44:60', to: 'eip155:8453/erc20:0xabc' }

  it('accepts exactly one fixed side', () => {
    expect(swapIntentSchema.parse({ ...base, amountIn: '1000' }).amountIn).toBe('1000')
    expect(swapIntentSchema.parse({ ...base, amountOut: '1000' }).amountOut).toBe('1000')
  })

  it('rejects both sides fixed, which has no single answer', () => {
    expect(() => swapIntentSchema.parse({ ...base, amountIn: '1', amountOut: '1' })).toThrow()
  })

  it('rejects neither side fixed', () => {
    expect(() => swapIntentSchema.parse(base)).toThrow()
  })

  it('caps slippage, because a wide tolerance is a real loss', () => {
    expect(() => swapIntentSchema.parse({ ...base, amountIn: '1', slippageBps: 5000 })).toThrow()
    expect(() => swapIntentSchema.parse({ ...base, amountIn: '1', slippageBps: 0 })).toThrow()
    expect(swapIntentSchema.parse({ ...base, amountIn: '1', slippageBps: 50 }).slippageBps).toBe(50)
  })
})
