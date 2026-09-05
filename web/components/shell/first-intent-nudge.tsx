'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { Otto } from '@/components/brand'
import { Button, Card } from '@/components/ui'
import { cn } from '@/lib/cn'

const STORAGE_KEY = 'ot-nudge-first-intent'

/** Verbatim from the design. The first is the smallest ask, so it copies. */
export const EXAMPLE_PROMPTS = [
  'Swap 20 USDC for ETH on Base',
  'Move my idle USDC to the cheapest chain',
  'Show me every unlimited approval I have',
] as const

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let listeners: (() => void)[] = []

function subscribe(onChange: () => void): () => void {
  // Dismissing in one tab should not leave the nudge sitting in another.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange()
  }
  listeners.push(onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners = listeners.filter((l) => l !== onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * Dismissed on the server, because the server cannot know. Rendering the nudge
 * into the HTML and pulling it back on hydration would show it for a frame to
 * exactly the people who already said no.
 */
const dismissedOnServer = () => true

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * The first-intent nudge.
 *
 * A popover on the portfolio, never a blocking modal — it sits at the bottom of
 * the page and can be ignored forever. Dismissed once, it stays dismissed.
 *
 * The copy confirmation echoes the prompt rather than saying "Copied": three
 * examples are on screen and one button copies, so the only way to know which
 * one you got is to be told.
 */
export function FirstIntentNudge({ className }: { className?: string }) {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, dismissedOnServer)
  const [copy, setCopy] = useState<CopyState>('idle')

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Private browsing can refuse storage. It still goes away for this visit.
    }
    listeners.forEach((l) => l())
  }, [])

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PROMPTS[0])
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }, [])

  if (dismissed) return null

  return (
    <div
      className={cn(
        'mt-auto border-t border-[var(--ot-border)] px-5 py-[18px] sm:px-[26px]',
        className,
      )}
    >
      <Card raised className="flex max-w-[520px] flex-col gap-[13px] p-[18px]">
        <div className="flex items-start gap-[11px]">
          <div className="ot-drift flex-none">
            <Otto pose="base" size={52} animated />
          </div>
          <p className="m-0 text-[14px] leading-[1.5]">
            Nothing to request for yet. Try me with something small — I&rsquo;ll show you the whole
            plan before anything is signed.
          </p>
        </div>

        <ul className="flex list-none flex-col gap-[7px] p-0">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <li
              key={prompt}
              className="rounded-[10px] bg-[var(--ot-surface-2)] px-3 py-[10px] text-[13px]"
            >
              &ldquo;{prompt}&rdquo;
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCopy}>
            Copy a prompt
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Not now
          </Button>
          <span
            role="status"
            className="text-[12px] text-[var(--ot-text-3)]"
          >
            {copy === 'copied'
              ? `Copied “${EXAMPLE_PROMPTS[0]}”`
              : copy === 'failed'
                ? 'Could not reach the clipboard — select the first prompt to copy it.'
                : ''}
          </span>
        </div>
      </Card>
    </div>
  )
}
