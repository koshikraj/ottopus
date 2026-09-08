'use client'

import { useState } from 'react'
import { AddressChip, Badge, Button, Dialog } from '@/components/ui'
import type { Arm } from '@/lib/api'
import { armName } from './naming'

export interface WalletListProps {
  wallets: Arm[]
  onUnlink: (arm: Arm) => Promise<void>
}

export function WalletList({ wallets, onUnlink }: WalletListProps) {
  const [confirming, setConfirming] = useState<Arm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function dismiss() {
    if (busy) return
    setConfirming(null)
    setError(null)
  }

  async function confirm() {
    if (!confirming) return
    setBusy(true)
    setError(null)
    try {
      await onUnlink(confirming)
      setConfirming(null)
    } catch {
      // The dialog stays open holding the error. Closing it on failure would
      // look exactly like success, and the wallet would still be linked.
      //
      // Rejecting the signature in the wallet lands here too, which is why the
      // wording does not assert that anything went wrong on our side.
      setError('That wallet is still linked. Nothing changed — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ul className="flex flex-col">
        {wallets.map((arm) => (
          <li
            key={arm.id}
            className="flex items-center gap-3 border-b border-[var(--ot-border)] px-5 py-3.5 sm:px-[26px]"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-semibold">{armName(arm)}</span>
                {arm.isWatchOnly ? (
                  // Said on every row, not once in a legend. Whether an arm can
                  // sign is the thing that decides if a plan can use it.
                  <Badge tone="neutral">Watch-only</Badge>
                ) : (
                  <Badge tone="ok">Proved</Badge>
                )}
              </div>
              <AddressChip address={arm.address} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(arm)}
              aria-label={`Unlink ${armName(arm)}`}
            >
              Unlink
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={confirming !== null}
        onClose={dismiss}
        tone="destructive"
        title={`Unlink ${confirming ? armName(confirming) : ''}?`}
        description={
          confirming?.isWatchOnly
            ? 'Ottopus stops reading its balances and stops counting it when planning.'
            : 'Ottopus stops planning with this wallet. Anything already signed is unaffected, and you can link it again whenever you like.'
        }
        actions={
          <>
            <Button variant="ghost" onClick={dismiss} disabled={busy} fullWidth>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void confirm()} disabled={busy} fullWidth>
              {busy ? 'Unlinking…' : 'Unlink'}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-[13px] leading-[1.5] text-[var(--ot-block-text)]">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  )
}
