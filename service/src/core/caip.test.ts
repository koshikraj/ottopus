import { describe, expect, it } from 'vitest'
import {
  CaipError,
  accountIdSchema,
  accountOn,
  assetIdSchema,
  chainIdSchema,
  chainOf,
  formatAccountId,
  fromEvmChainId,
  isNativeAsset,
  nativeAssetOf,
  parseAccountId,
  parseAssetId,
  parseChainId,
  toEvmChainId,
} from './caip.js'

describe('chain ids', () => {
  it('parses and reformats', () => {
    expect(parseChainId('eip155:8453')).toEqual({ namespace: 'eip155', reference: '8453' })
  })

  it('rejects a bare chain number', () => {
    expect(() => parseChainId('8453')).toThrow(CaipError)
  })

  it('converts to and from an EVM chain id', () => {
    expect(toEvmChainId('eip155:8453')).toBe(8453)
    expect(fromEvmChainId(56)).toEqual({ namespace: 'eip155', reference: '56' })
  })

  it('refuses to give an EVM id for a non-EVM chain', () => {
    // Returning NaN here would silently target the wrong network.
    expect(() => toEvmChainId('solana:5eykt4Usc')).toThrow(/not an EVM chain/)
  })
})

describe('account ids', () => {
  it('lowercases EVM addresses so one wallet cannot look like two', () => {
    const mixed = 'eip155:8453:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const lower = 'eip155:8453:0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
    expect(formatAccountId(parseAccountId(mixed))).toBe(lower)
    expect(parseAccountId(mixed).address).toBe(parseAccountId(lower).address)
  })

  it('leaves non-EVM addresses alone, where case is significant', () => {
    const solana = 'solana:5eykt4Usc:7S3P4HxJpyyigGzodYwHtCxZyUQe9L4'
    expect(parseAccountId(solana).address).toBe('7S3P4HxJpyyigGzodYwHtCxZyUQe9L4')
  })

  it('builds an account from a chain', () => {
    expect(accountOn({ namespace: 'eip155', reference: '1' }, '0xABC')).toBe('eip155:1:0xabc')
  })

  it('recovers the chain from an account', () => {
    expect(chainOf(parseAccountId('eip155:8453:0xabc'))).toEqual({
      namespace: 'eip155',
      reference: '8453',
    })
  })

  it('rejects an address with no chain', () => {
    expect(() => parseAccountId('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toThrow(CaipError)
  })
})

describe('asset ids', () => {
  it('parses an ERC-20', () => {
    const usdc = parseAssetId('eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    expect(usdc.assetNamespace).toBe('erc20')
    expect(usdc.assetReference).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
  })

  it('parses an NFT with a token id', () => {
    const nft = parseAssetId('eip155:1/erc721:0xabc/1234')
    expect(nft.tokenId).toBe('1234')
  })

  it('recognises the native asset', () => {
    expect(nativeAssetOf('eip155:8453')).toBe('eip155:8453/slip44:60')
    expect(isNativeAsset('eip155:8453/slip44:60')).toBe(true)
    expect(isNativeAsset('eip155:8453/erc20:0xabc')).toBe(false)
  })

  it('rejects a bare token address', () => {
    expect(() => parseAssetId('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')).toThrow(CaipError)
  })
})

describe('schemas normalise on the way in', () => {
  it('returns a lowercased account, so callers cannot forget', () => {
    expect(accountIdSchema.parse('eip155:1:0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045')).toBe(
      'eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    )
  })

  it('accepts valid chain and asset ids', () => {
    expect(chainIdSchema.parse('eip155:8453')).toBe('eip155:8453')
    expect(assetIdSchema.parse('eip155:8453/slip44:60')).toBe('eip155:8453/slip44:60')
  })

  it('rejects the shapes an agent is most likely to send', () => {
    expect(() => accountIdSchema.parse('0xabc')).toThrow()
    expect(() => chainIdSchema.parse('base')).toThrow()
    expect(() => chainIdSchema.parse('8453')).toThrow()
    expect(() => assetIdSchema.parse('USDC')).toThrow()
  })
})
