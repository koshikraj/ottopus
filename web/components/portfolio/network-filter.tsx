'use client'

import type { ChainRow } from '@/lib/api'
import { cn } from '@/lib/cn'

export interface NetworkFilterProps {
  chains: readonly ChainRow[]
  /** CAIP-2, or null for every network. */
  value: string | null
  onChange: (chainId: string | null) => void
  className?: string
}

const ALL = '__all__'

/**
 * The network filter, sitting where the tab bar's `aside` goes.
 *
 * A real `<select>` rather than a styled `Chip`, deliberately: the design
 * system says a neutral chip carries a fact and is never a clickable filter,
 * because something chip-shaped that can be pressed implies filters elsewhere
 * that do not exist. This one genuinely filters, so it looks and behaves like a
 * control — focusable, keyboard-operable, and a native picker on mobile.
 *
 * The chevron is drawn rather than left to the platform, so the control looks
 * the same on every OS; the select itself sits transparently on top of it and
 * keeps all the behaviour.
 */
export function NetworkFilter({ chains, value, onChange, className }: NetworkFilterProps) {
  // Nothing to filter with fewer than two networks, and a picker with one
  // option is a control that cannot do anything.
  if (chains.length < 2) return null

  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-[var(--ot-radius-sm)]',
        'bg-[var(--ot-surface-3)] text-[12px] font-medium text-[var(--ot-text-2)]',
        // The wrapper is the control a person sees, so the ring goes here
        // rather than on the transparent select inside it. Same 2px offset ring
        // as the global :focus-visible rule.
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
        'focus-within:outline-[var(--ot-plan)]',
        className,
      )}
    >
      <select
        aria-label="Filter by network"
        value={value ?? ALL}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === ALL ? null : next)
        }}
        className="cursor-pointer appearance-none bg-transparent py-1 pr-7 pl-2.5 leading-none focus:outline-none"
      >
        <option value={ALL}>All networks</option>
        {chains.map((chain) => (
          <option key={chain.chainId} value={chain.chainId}>
            {chain.name}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2.5 h-2.5 w-2.5"
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
