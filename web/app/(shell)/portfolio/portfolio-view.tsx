'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { usePrivyAvailable } from '@/components/auth'
import { Otto } from '@/components/brand'
import { BubbleField } from '@/components/motion'
import { SkeletonShelf } from '@/components/motion/loaders'
import { Figure, FirstIntentNudge, PageHeader, TabBar } from '@/components/shell'
import { Button, buttonClasses, Callout, Chip, EmptyState } from '@/components/ui'
import { LinkWalletDialog, MAX_ARMS, WalletList, useWallets } from '@/components/wallets'
import type { Arm } from '@/lib/api'

/**
 * Portfolio, reading the real arm list. Balances still come with #8 and #9.
 *
 * Client-side because the wallet list is: it lives behind a Privy session held
 * in the browser, so a server render has nothing to read. The page above keeps
 * the metadata export.
 *
 * Split for the same reason the other wallet surfaces are — Privy's hooks throw
 * outside their provider, and the provider does not mount without a valid app
 * id. The frame renders either way.
 */
export function PortfolioView() {
  return usePrivyAvailable() ? <ConnectedPortfolio /> : <Frame wallets={[]} />
}

function ConnectedPortfolio() {
  // One `useWallets` for the whole page. LinkWalletButton would bring its own,
  // and two of them means two components reconciling the same account against
  // the same token — so the dialog is driven from here instead.
  const { state, unlink, linkWallet, linking, linkError, addWatchOnly } = useWallets()
  const [linkOpen, setLinkOpen] = useState(false)

  const wallets = state.status === 'ready' ? state.wallets : []

  return (
    <Frame
      wallets={wallets}
      loading={state.status === 'loading'}
      onLink={() => setLinkOpen(true)}
      body={wallets.length > 0 ? <WalletList wallets={wallets} onUnlink={unlink} /> : null}
      dialog={
        <LinkWalletDialog
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          onConnect={linkWallet}
          onPaste={addWatchOnly}
          linking={linking}
          linkError={linkError}
          used={wallets.length}
          max={MAX_ARMS}
        />
      }
    />
  )
}

interface FrameProps {
  wallets: Arm[]
  loading?: boolean
  onLink?: (() => void) | undefined
  body?: ReactNode
  dialog?: ReactNode
}

/**
 * The page's furniture, and the one judgement call in it.
 *
 * The total stays a dash until balances are connected. "$0" next to a linked
 * wallet is not an empty state, it is a false one — and "you have nothing" is
 * exactly the kind of wrong someone might act on. Zero is only honest when
 * there is nothing to read a balance from.
 */
function Frame({ wallets, loading = false, onLink, body, dialog }: FrameProps) {
  const linked = wallets.length > 0

  return (
    <>
      <PageHeader
        title="Portfolio"
        eyebrow="Total balance"
        headline={linked ? <Figure whole="—" /> : <Figure whole="$0" fraction="00" />}
        detail={
          linked
            ? `${wallets.length} wallet${wallets.length > 1 ? 's' : ''} linked. Balances are still being wired up.`
            : 'No wallets linked yet.'
        }
        action={
          <Link href="/settings" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
            Manage
          </Link>
        }
      />
      <TabBar
        label="Portfolio views"
        tabs={[
          { value: 'tokens', label: 'Tokens' },
          { value: 'wallets', label: 'Wallets' },
          { value: 'approvals', label: 'Approvals', disabled: true },
        ]}
        aside={<Chip>All networks</Chip>}
      />

      {loading ? (
        <SkeletonShelf rows={2} />
      ) : linked ? (
        <div className="flex flex-1 flex-col">
          {body}
          <div className="px-5 py-5 sm:px-[26px]">
            <Callout severity="info" title="Balances aren’t connected yet">
              Your arms are linked and Ottopus knows about them. Reading what’s in them arrives
              with the portfolio connector.
            </Callout>
          </div>
        </div>
      ) : (
        <div className="ot-canvas relative flex flex-1 items-center justify-center overflow-hidden px-5 py-7">
          <BubbleField pattern="calm" />
          <EmptyState
            className="relative"
            title="No wallets yet"
            description="Link a wallet and I’ll start keeping an eye on it. Up to eight."
            illustration={<Otto pose="base" size={120} animated />}
            action={
              <Button variant="primary" size="sm" onClick={onLink} disabled={!onLink}>
                Link wallet
              </Button>
            }
          />
        </div>
      )}

      {dialog}
      <FirstIntentNudge />
    </>
  )
}
