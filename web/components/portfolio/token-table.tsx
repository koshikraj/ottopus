import { Chip } from '@/components/ui'
import type { AssetRow, Portfolio } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatAmount, formatMoneyFlat, formatShare } from '@/lib/format'

const COLUMNS =
  'grid-cols-[minmax(120px,1.5fr)_110px_110px_70px_110px]'

export interface TokenTableProps {
  rows: readonly AssetRow[]
  chains: Portfolio['chains']
  currency?: string
  /** Set while the first read is in flight, to keep the header from flashing. */
  loading?: boolean
}

/** "In Aave V3", "Staked" — what part of a balance is not loose. */
function heldAs(row: AssetRow): string | null {
  const away = row.holdings.filter((h) => h.positionType !== 'wallet')
  if (away.length === 0) return null

  if (row.holdings.every((h) => h.positionType === 'loan')) return 'Borrowed'

  const protocols = [...new Set(away.map((h) => h.protocol).filter(Boolean))]
  if (protocols.length === 1) return `In ${protocols[0]}`
  if (protocols.length > 1) return `In ${protocols.length} protocols`

  const types = [...new Set(away.map((h) => h.positionType))]
  return types.length === 1 ? TYPE_LABELS[types[0]!] : 'In protocols'
}

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Deposited',
  loan: 'Borrowed',
  locked: 'Locked',
  staked: 'Staked',
  reward: 'Rewards',
  investment: 'Invested',
  wallet: 'In wallet',
}

function Icon({ row }: { row: AssetRow }) {
  if (row.asset.iconUrl) {
    return (
      // Not next/image: these are third-party CDN URLs from a pricing provider,
      // an unbounded set no remotePatterns config can enumerate honestly.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={row.asset.iconUrl}
        alt=""
        width={34}
        height={34}
        loading="lazy"
        className="h-[34px] w-[34px] flex-none rounded-full bg-[var(--ot-surface-3)]"
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full',
        'bg-[var(--ot-surface-3)] font-display text-[13px] font-bold text-[var(--ot-text-2)]',
      )}
    >
      {(row.asset.symbol || '?').charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The tokens view: one row per asset per chain, merged across every arm.
 *
 * Merged by CAIP-19 rather than by symbol, so USDC on Base and USDC on
 * Ethereum stay two rows — they are two different contracts, and a plan can
 * only spend one of them at a time.
 *
 * Balances render from base units through `formatAmount`, never from a float.
 * The value column is fiat and rounds, which is fine; the balance column is the
 * one a person checks against their wallet.
 */
export function TokenTable({ rows, chains, currency = 'usd', loading = false }: TokenTableProps) {
  const names = new Map(chains.map((c) => [c.chainId, c.name]))

  return (
    <div className="flex flex-col overflow-x-auto px-5 pb-5 tabular-nums sm:px-[26px]">
      <div className={`min-w-[620px] grid ${COLUMNS} gap-3.5 py-3 text-[12px] text-[var(--ot-text-3)]`}>
        <span>Asset</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Spendable</span>
        <span className="text-right">Share</span>
        <span className="text-right">Value</span>
      </div>

      {rows.map((row) => {
        const held = heldAs(row)
        const chain = names.get(row.chainId) ?? row.chainId

        return (
          <div
            key={row.assetId}
            className={`min-w-[620px] grid ${COLUMNS} items-center gap-3.5 border-t border-[var(--ot-border)] py-3`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Icon row={row} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 truncate text-[14px] font-semibold">
                  {row.asset.symbol || row.asset.name}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ot-text-3)]">
                  {chain}
                  {held ? <Chip className="text-[11px]">{held}</Chip> : null}
                  {/* Said out loud rather than shown as a badge: an unverified
                      token is the shape most token scams take, and the
                      provider's spam filter is not the same as vouching. */}
                  {row.asset.verified ? null : (
                    <Chip className="text-[11px] text-[var(--ot-warn-text)]">Unverified</Chip>
                  )}
                </span>
              </div>
            </div>

            <code className="text-right font-mono text-[14px] font-semibold">
              {formatAmount(row.amount, row.asset.decimals)}
            </code>

            <code className="text-right font-mono text-[14px]">
              {formatAmount(row.spendable, row.asset.decimals)}
            </code>

            <span className="text-right text-[13px] text-[var(--ot-text-2)]">
              {formatShare(row.share)}
            </span>

            <code
              className={cn(
                'text-right font-mono text-[14px]',
                row.value < 0 ? 'text-[var(--ot-warn-text)]' : 'text-[var(--ot-text)]',
              )}
            >
              {row.holdings.every((holding) => holding.value === null) ? '—' : formatMoneyFlat(row.value, currency)}
            </code>
          </div>
        )
      })}

      {rows.length === 0 && !loading ? (
        <p className="border-t border-[var(--ot-border)] pt-4 text-[12.5px] leading-[1.5] text-[var(--ot-text-2)]">
          Nothing to show here. Otto found no balances on this network.
        </p>
      ) : null}
    </div>
  )
}
