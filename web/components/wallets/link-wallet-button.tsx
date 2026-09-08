'use client'

import { useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui'
import { LinkWalletDialog } from './link-wallet-dialog'
import { MAX_ARMS, useWallets } from './use-wallets'

export interface LinkWalletButtonProps extends Pick<ButtonProps, 'variant' | 'size' | 'fullWidth'> {
  children?: string
}

/**
 * The link flow, on its own, for pages that are not about wallets.
 *
 * One per page. It calls `useWallets`, and a second instance would mean two
 * components reconciling the same account against the same identity token —
 * harmless, since sync is idempotent, but wasteful and confusing to debug.
 * Anywhere that wants the list as well should use `WalletsPanel` instead.
 */
export function LinkWalletButton({
  variant = 'primary',
  size = 'sm',
  fullWidth,
  children = 'Link wallet',
}: LinkWalletButtonProps) {
  const { state, linkWallet, linking, linkError, addWatchOnly } = useWallets()
  const [open, setOpen] = useState(false)
  const used = state.status === 'ready' ? state.wallets.length : 0

  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth ?? false}
        onClick={() => setOpen(true)}
        disabled={state.status === 'loading'}
      >
        {children}
      </Button>
      <LinkWalletDialog
        open={open}
        onClose={() => setOpen(false)}
        onConnect={linkWallet}
        onPaste={addWatchOnly}
        linking={linking}
        linkError={linkError}
        used={used}
        max={MAX_ARMS}
      />
    </>
  )
}
