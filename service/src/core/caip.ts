import { z } from 'zod'

/**
 * CAIP identifiers — the only way chains, accounts and assets are named.
 *
 * A bare "0xabc" or chainId 8453 is ambiguous the moment a second chain exists,
 * and this product is multi-chain from the first plan. Every boundary — MCP tool
 * inputs, plan payloads, the database — uses these instead.
 *
 *   CAIP-2  chain    eip155:8453
 *   CAIP-10 account  eip155:8453:0xd8da...
 *   CAIP-19 asset    eip155:8453/erc20:0x833589...   native: eip155:8453/slip44:60
 *
 * Grammar follows the specs: namespace [-a-z0-9]{3,8}, reference
 * [-_a-zA-Z0-9]{1,32}, address and asset reference [-.%a-zA-Z0-9]{1,128}.
 */

const NAMESPACE = '[-a-z0-9]{3,8}'
const REFERENCE = '[-_a-zA-Z0-9]{1,32}'
const ACCOUNT_ADDRESS = '[-.%a-zA-Z0-9]{1,128}'
const ASSET_NAMESPACE = '[-a-z0-9]{3,8}'
const ASSET_REFERENCE = '[-.%a-zA-Z0-9]{1,128}'
const TOKEN_ID = '[-.%a-zA-Z0-9]{1,78}'

export const CHAIN_ID_RE = new RegExp(`^(${NAMESPACE}):(${REFERENCE})$`)
export const ACCOUNT_ID_RE = new RegExp(`^(${NAMESPACE}):(${REFERENCE}):(${ACCOUNT_ADDRESS})$`)
export const ASSET_TYPE_RE = new RegExp(
  `^(${NAMESPACE}):(${REFERENCE})/(${ASSET_NAMESPACE}):(${ASSET_REFERENCE})(?:/(${TOKEN_ID}))?$`,
)

export interface ChainId {
  namespace: string
  reference: string
}

export interface AccountId extends ChainId {
  address: string
}

export interface AssetId extends ChainId {
  assetNamespace: string
  assetReference: string
  tokenId?: string
}

export class CaipError extends Error {}

/**
 * EVM addresses are compared, indexed and stored lowercase — the database has a
 * check constraint saying so. Checksum casing is a display concern and must
 * never reach a lookup key, or the same wallet linked twice looks like two.
 */
function normaliseAddress(namespace: string, address: string): string {
  return namespace === 'eip155' ? address.toLowerCase() : address
}

export function parseChainId(input: string): ChainId {
  const m = CHAIN_ID_RE.exec(input)
  if (!m) throw new CaipError(`not a CAIP-2 chain id: ${input}`)
  return { namespace: m[1]!, reference: m[2]! }
}

export function formatChainId(chain: ChainId): string {
  return `${chain.namespace}:${chain.reference}`
}

export function parseAccountId(input: string): AccountId {
  const m = ACCOUNT_ID_RE.exec(input)
  if (!m) throw new CaipError(`not a CAIP-10 account id: ${input}`)
  const namespace = m[1]!
  return {
    namespace,
    reference: m[2]!,
    address: normaliseAddress(namespace, m[3]!),
  }
}

export function formatAccountId(account: AccountId): string {
  return `${account.namespace}:${account.reference}:${normaliseAddress(account.namespace, account.address)}`
}

export function parseAssetId(input: string): AssetId {
  const m = ASSET_TYPE_RE.exec(input)
  if (!m) throw new CaipError(`not a CAIP-19 asset id: ${input}`)
  const asset: AssetId = {
    namespace: m[1]!,
    reference: m[2]!,
    assetNamespace: m[3]!,
    assetReference: m[1] === 'eip155' && m[3] === 'erc20' ? m[4]!.toLowerCase() : m[4]!,
  }
  if (m[5] !== undefined) asset.tokenId = m[5]
  return asset
}

export function formatAssetId(asset: AssetId): string {
  const base = `${asset.namespace}:${asset.reference}/${asset.assetNamespace}:${asset.assetReference}`
  return asset.tokenId === undefined ? base : `${base}/${asset.tokenId}`
}

/** An account on a chain, without repeating the chain. */
export function accountOn(chain: ChainId, address: string): string {
  return formatAccountId({ ...chain, address })
}

/** The chain an account or asset belongs to. */
export function chainOf(id: AccountId | AssetId): ChainId {
  return { namespace: id.namespace, reference: id.reference }
}

/**
 * EVM chain id as a number, for viem and wallet RPC. Throws on a non-EVM chain
 * rather than returning NaN, which would silently target the wrong network.
 */
export function toEvmChainId(chain: ChainId | string): number {
  const parsed = typeof chain === 'string' ? parseChainId(chain) : chain
  if (parsed.namespace !== 'eip155') {
    throw new CaipError(`not an EVM chain: ${formatChainId(parsed)}`)
  }
  const id = Number(parsed.reference)
  if (!Number.isInteger(id) || id <= 0) {
    throw new CaipError(`invalid EVM chain reference: ${parsed.reference}`)
  }
  return id
}

export function fromEvmChainId(chainId: number): ChainId {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new CaipError(`invalid EVM chain id: ${chainId}`)
  }
  return { namespace: 'eip155', reference: String(chainId) }
}

/** The chain's own currency, e.g. ETH on Base is eip155:8453/slip44:60. */
export function nativeAssetOf(chain: ChainId | string): string {
  const parsed = typeof chain === 'string' ? parseChainId(chain) : chain
  if (parsed.namespace !== 'eip155') {
    throw new CaipError(`no known native asset for ${formatChainId(parsed)}`)
  }
  return `${formatChainId(parsed)}/slip44:60`
}

export function isNativeAsset(asset: AssetId | string): boolean {
  const parsed = typeof asset === 'string' ? parseAssetId(asset) : asset
  return parsed.assetNamespace === 'slip44'
}

/**
 * Zod schemas. These parse to the normalised string form, so anything that
 * survives validation is already lowercased where it should be — callers cannot
 * forget.
 */
export const chainIdSchema = z
  .string()
  .regex(CHAIN_ID_RE, 'expected a CAIP-2 chain id, e.g. eip155:8453')
  .transform((s) => formatChainId(parseChainId(s)))

export const accountIdSchema = z
  .string()
  .regex(ACCOUNT_ID_RE, 'expected a CAIP-10 account id, e.g. eip155:8453:0xabc…')
  .transform((s) => formatAccountId(parseAccountId(s)))

export const assetIdSchema = z
  .string()
  .regex(ASSET_TYPE_RE, 'expected a CAIP-19 asset id, e.g. eip155:8453/erc20:0xabc…')
  .transform((s) => formatAssetId(parseAssetId(s)))
