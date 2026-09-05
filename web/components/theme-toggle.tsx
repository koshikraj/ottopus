'use client'

import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'

type Choice = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'ot-theme'
const CHOICES: Choice[] = ['light', 'system', 'dark']

/**
 * Three states, not two. "System" is a real choice and the default — a two-way
 * toggle silently opts everyone out of their OS setting the first time they
 * touch it.
 *
 * The attribute is what the tokens key off: [data-theme] wins, and its absence
 * means follow prefers-color-scheme.
 */
function apply(choice: Choice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
}

/**
 * localStorage is the source of truth, so the control reads from it rather than
 * mirroring it into React state. That avoids a setState-in-effect cascade, and
 * the storage event keeps other tabs in step for free.
 */
let listeners: (() => void)[] = []

function subscribe(onChange: () => void): () => void {
  listeners.push(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners = listeners.filter((l) => l !== onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** The server cannot know the stored choice, and guessing would flash. */
const serverChoice = (): Choice => 'system'

function pick(next: Choice): void {
  apply(next)
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private browsing can refuse storage; the choice still applies for now.
  }
  listeners.forEach((l) => l())
}

export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, readChoice, serverChoice)

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'inline-flex gap-1 rounded-[var(--ot-radius-pill)] border border-[var(--ot-border)]',
        'bg-[var(--ot-card)] p-1',
        className,
      )}
    >
      {CHOICES.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={choice === c}
          onClick={() => pick(c)}
          className={cn(
            'cursor-pointer rounded-[var(--ot-radius-pill)] px-3 py-1 text-[12px] font-medium capitalize',
            'transition-colors duration-[var(--ot-dur-fast)]',
            choice === c
              ? 'bg-[var(--ot-coral)] text-[var(--ot-on-state)]'
              : 'text-[var(--ot-text-2)] hover:text-[var(--ot-text)]',
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

/**
 * Runs before first paint, so a stored dark choice does not flash light first.
 * Inline and synchronous on purpose — anything deferred is too late.
 */
export const themeScript = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`
