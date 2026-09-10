'use client'

import { useState } from 'react'
import { AssetIcon } from '@/components/portfolio/asset-icon'
import { StatusChip } from '@/components/ui'
import type { PlanSummary } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatAmount, formatMoneyFlat, truncateAddress } from '@/lib/format'
import {
  type StatusFilter,
  type WalletFilter,
  effectiveStatus,
  filterPlans,
  kindWord,
  sortPlans,
  statusCounts,
  walletOptions,
} from './plans'

/**
 * P5. A count, a row of filters, and a grid where every row opens its review
 * page. Waiting-on-you rows sit at the top whatever the filter; blocked rows
 * say what did not happen.
 *
 * Desktop is the four-column grid the design draws. Below 640px the columns
 * stack inside the row: request, then amount and status side by side, then
 * the date — a table that scrolls sideways on a phone is a table nobody reads.
 */
export interface PlanTableProps {
  plans: readonly PlanSummary[]
  opening: string | null
  onOpen: (id: string) => void
  /** The clock, owned by the parent so rendering stays pure and expiry still moves. */
  now: number
}

const STATUS_LABEL: Record<string, string> = {
  awaiting_review: 'To review',
  awaiting_signature: 'To sign',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  blocked: 'Blocked',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  superseded: 'Replaced',
  draft: 'Draft',
}

export function PlanTable({ plans, opening, onOpen, now }: PlanTableProps) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [wallet, setWallet] = useState<WalletFilter>('all')
  const sorted = sortPlans(plans, now)
  const counts = statusCounts(sorted, now)
  const wallets = walletOptions(sorted)
  const shown = filterPlans(sorted, status, wallet, now)

  return (
    <section className="overflow-hidden rounded-[18px] border border-[var(--ot-border)] bg-[var(--ot-card)]">
      <header className="flex flex-col gap-3 px-4 pt-[18px] pb-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-[22px]">
        <span className="font-[family-name:var(--ot-font-display)] text-[20px] font-semibold">
          {plans.length} {plans.length === 1 ? 'request' : 'requests'}
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          <Pill active={status === 'all'} onClick={() => setStatus('all')}>
            All
          </Pill>
          {counts.map((c) => (
            <Pill key={c.status} active={status === c.status} onClick={() => setStatus(status === c.status ? 'all' : c.status)}>
              {STATUS_LABEL[c.status]} <span className="text-[11px] text-[var(--ot-text-3)]">{c.count}</span>
            </Pill>
          ))}
          {wallets.length > 1 ? (
            <select
              aria-label="Filter by wallet"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              className="rounded-[var(--ot-radius-pill)] border border-[var(--ot-border)] bg-[var(--ot-card)] px-3 py-1.5 text-[13px] font-medium text-[var(--ot-text-2)]"
            >
              <option value="all">All wallets · {wallets.length}</option>
              {wallets.map((w) => (
                <option key={w.caip10} value={w.caip10}>
                  {w.label} · {w.count}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      <div className="hidden grid-cols-[minmax(0,1.7fr)_150px_150px_120px] gap-4 px-[22px] py-2.5 text-[12px] text-[var(--ot-text-3)] sm:grid">
        <span>Request</span>
        <span className="text-right">Amount</span>
        <span>Status</span>
        <span className="text-right">Date</span>
      </div>

      {shown.length === 0 ? (
        <p className="px-[22px] py-8 text-center text-[13px] text-[var(--ot-text-2)]">Nothing matches that filter.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map((row) => (
            <Row key={`${row.id}:${row.version}`} row={row} now={now} opening={opening === row.id} disabled={opening !== null} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-[var(--ot-radius-pill)] px-3 py-1.5 text-[13px] font-medium transition-colors',
        active ? 'bg-[var(--ot-surface-2)] text-[var(--ot-text)]' : 'text-[var(--ot-text-3)] hover:bg-[var(--ot-surface-2)] hover:text-[var(--ot-text)]',
      )}
    >
      {children}
    </button>
  )
}

function Row({ row, now, opening, disabled, onOpen }: { row: PlanSummary; now: number; opening: boolean; disabled: boolean; onOpen: (id: string) => void }) {
  const status = effectiveStatus(row, now)
  const created = new Date(row.createdAt)
  const symbol = row.asset?.symbol ?? null
  const amount = row.asset && row.asset.decimals !== null ? formatAmount(row.asset.amount, row.asset.decimals, { maxFractionDigits: 4 }) : null
  const walletName = row.account.label ?? row.wallet?.label ?? truncateAddress(row.account.caip10.split(':')[2] ?? '')
  const detail = [
    row.recipient ? `${symbol ?? 'Asset'} → ${row.recipient.name ?? truncateAddress(row.recipient.address)}` : row.summary,
    walletName,
    `request #${row.id.slice(0, 6)}`,
  ].join(' · ')

  return (
    <li className="border-t border-[var(--ot-border)]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpen(row.id)}
        className={cn(
          'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors',
          'sm:grid-cols-[minmax(0,1.7fr)_150px_150px_120px] sm:items-center sm:gap-4 sm:px-[22px] sm:py-[13px]',
          'hover:bg-[var(--ot-surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--ot-plan)] disabled:opacity-60',
          opening && 'bg-[var(--ot-surface-2)]',
        )}
      >
        <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
          <span aria-hidden className="relative h-[34px] w-[34px] flex-none">
            <AssetIcon url={row.assetIconUrl} name={symbol ?? '?'} size={34} className="text-[12px]" />
            {row.chainIconUrl ? (
              <span className="absolute -right-px -bottom-px h-[15px] w-[15px] overflow-hidden rounded-full border-2 border-[var(--ot-card)] bg-[var(--ot-card)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.chainIconUrl} alt="" className="h-full w-full object-cover" />
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-semibold">{kindWord(row.kind)}</span>
            <span className="truncate text-[12px] text-[var(--ot-text-3)]">{detail}</span>
          </span>
        </span>

        <span className="flex flex-col gap-0.5 sm:items-end sm:text-right">
          <code className="font-mono text-[14px] font-semibold tabular-nums">
            {row.valueUsd !== null ? `−$${formatMoneyFlat(row.valueUsd)}` : amount ? `−${amount} ${symbol ?? ''}` : '—'}
          </code>
          <code className="font-mono text-[12px] text-[var(--ot-text-3)] tabular-nums">
            {row.valueUsd !== null && amount ? `${amount} ${symbol ?? ''}` : ''}
          </code>
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={status} />
          {status === 'blocked' ? <span className="text-[11.5px] text-[var(--ot-block-text)]">Nothing was signed</span> : null}
          {opening ? <span className="text-[11.5px] text-[var(--ot-plan-text)]">Opening…</span> : null}
        </span>

        <span className="col-span-2 flex gap-1.5 text-[12px] text-[var(--ot-text-3)] sm:col-span-1 sm:flex-col sm:gap-0.5 sm:text-right">
          <span className="text-[13px] text-[var(--ot-text-2)]">
            {created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span>{created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </span>
      </button>
    </li>
  )
}
