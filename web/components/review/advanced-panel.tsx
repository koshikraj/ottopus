'use client'

import { Badge } from '@/components/ui'
import type { Plan, Visuals } from '@/lib/api'
import { chainName, explorerAddressUrl } from '@/lib/chains'
import { cn } from '@/lib/cn'
import {
  SOURCE_LABEL,
  changeSource,
  chainOfPlan,
  decodedRows,
  preparedBy,
  recipientOf,
  simulationNote,
  verificationSummary,
} from './model'
import type { LiveSimulation } from './use-simulation'

/**
 * Everything a careful reader wants and a normal one does not: the decoded
 * calls, the raw bytes, the simulation's own numbers, and the identifiers
 * that make the plan checkable.
 *
 * Split out of the card because the card was answering two questions at once.
 * "Am I sending 500 USDC to the right person" is a five-second decision that
 * should fit on a screen with the button that acts on it; "what exactly does
 * this calldata do" is an investigation. Putting the second beside the first
 * on a wide screen, and behind one tap on a phone, lets the card be short
 * without hiding anything.
 *
 * Nothing here is exclusive to this panel. Anything that changes the decision
 * — a revert, an approval, an unverified contract — is also stated on the
 * card, because a warning nobody expands is not a warning.
 */

export interface AdvancedPanelProps {
  plan: Plan
  visuals: Visuals
  live?: LiveSimulation | undefined
  /** A neutral third-party decode of the calldata. Keyless. */
  decoderUrl?: string | null
  /**
   * Drop the panel's own card chrome. Set when it is nested inside the review
   * card on a narrow screen, where a bordered box inside a bordered box reads
   * as two things rather than one.
   */
  bare?: boolean
  className?: string
}

export function AdvancedPanel({ plan, visuals, live, decoderUrl, bare = false, className }: AdvancedPanelProps) {
  const chain = chainOfPlan(plan)
  const decoded = decodedRows(plan)
  const verification = verificationSummary(plan)
  const run = live?.run ?? null
  const source = changeSource(plan, run)
  const note = simulationNote(plan, run)
  const recipient = recipientOf(plan)
  const running = live?.kind === 'running'

  return (
    <section
      className={cn(
        'flex flex-col gap-4',
        bare ? 'pb-4' : 'rounded-[16px] border border-[var(--ot-border)] bg-[var(--ot-card)] px-[18px] py-4',
        className,
      )}
    >
      <Group
        title="Simulation"
        note={
          running
            ? 'Running against the chain right now…'
            : (note ?? 'No simulation ran. The decoded call below is what was checked.')
        }
        action={
          live && !running ? (
            <button
              type="button"
              onClick={live.again}
              className="cursor-pointer rounded-full border border-[var(--ot-border)] px-2 py-[3px] text-[11px] font-medium text-[var(--ot-text-2)] transition-colors hover:bg-[var(--ot-surface-3)]"
            >
              Run again
            </button>
          ) : null
        }
      >
        <Rows
          rows={[
            ['Rows above', SOURCE_LABEL[source]],
            ...(run ? ([['Block', run.blockNumber]] as [string, string][]) : []),
            ...(run?.gasUsed && run.gasUsed !== '0'
              ? ([['Gas', `${Number(run.gasUsed).toLocaleString()} units`]] as [string, string][])
              : []),
          ]}
        />
      </Group>

      <Group
        title={verification.allVerified ? 'Decoded and verified' : 'Decoded, not all verified'}
        note={`${decoded.length} ${decoded.length === 1 ? 'call' : 'calls'} · ${
          verification.contracts === 0
            ? 'no contracts touched'
            : verification.allVerified
              ? 'every contract has verified source'
              : 'some source is unverified'
        }`}
      >
        <div className="flex flex-col gap-px overflow-hidden rounded-[8px]">
          {decoded.map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-2.5 bg-[var(--ot-water-1)] px-3 py-2.5">
              <code className="min-w-0 truncate font-mono text-[12px] font-semibold">{row.signature}</code>
              <Badge tone={row.verified ? 'ok' : row.isContract ? 'warn' : 'neutral'}>
                {row.verified ? 'verified' : row.isContract ? 'unverified' : 'wallet'}
              </Badge>
            </div>
          ))}
        </div>
        {decoderUrl ? (
          <a
            href={decoderUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-[12px] font-medium text-[var(--ot-plan-text)] underline decoration-[var(--ot-plan)]/40 underline-offset-2"
          >
            Check this calldata in an independent decoder
          </a>
        ) : null}
      </Group>

      <Group title="The plan">
        <Rows
          rows={[
            ...(recipient
              ? ([['Recipient', recipient.name ? `${recipient.name} · ${short(recipient.address)}` : short(recipient.address)]] as [string, string][])
              : []),
            ['Network', chainName(chain)],
            ['Prepared by', preparedBy(plan)],
            ['Provenance', plan.provenance === 'agent_crafted' ? 'Agent-crafted' : 'Built by Ottopus'],
            ['Plan hash', `${plan.planHash.slice(0, 18)}…`],
            ...decoded.flatMap((row) => (row.contractName ? ([['Contract', row.contractName]] as [string, string][]) : [])),
          ]}
        />
        {recipient && explorerAddressUrl(chain, recipient.address) ? (
          <a
            href={explorerAddressUrl(chain, recipient.address)!}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-[12px] font-medium text-[var(--ot-plan-text)]"
          >
            View the recipient on the {chainName(chain)} explorer
          </a>
        ) : null}
      </Group>

      <Group title="Raw calls" note="What the wallet will be handed, byte for byte.">
        {decoded.map((row, i) => (
          <pre
            key={i}
            className="m-0 overflow-x-auto rounded-[8px] bg-[var(--ot-water-3)] px-[11px] py-2.5 font-mono text-[10.5px] leading-[1.6] break-all whitespace-pre-wrap text-[var(--ot-text-2)]"
          >
            {`to    ${row.raw.to}\nvalue ${row.raw.value}\ndata  ${row.raw.data}`}
          </pre>
        ))}
      </Group>

      <p className="m-0 text-[11px] leading-[1.5] text-[var(--ot-text-3)]">
        Visuals beside the plan — icons and names — are looked up separately and are not covered by the plan hash.
        {Object.keys(visuals.assets).length === 0 ? ' None were available for this plan.' : ''}
      </p>
    </section>
  )
}

function Group({
  title,
  note,
  action,
  children,
}: {
  title: string
  note?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[13px] font-semibold">{title}</h2>
        {action}
      </div>
      {note ? <p className="m-0 text-[11.5px] leading-[1.45] text-[var(--ot-text-3)]">{note}</p> : null}
      {children}
    </div>
  )
}

/** Label/value pairs, tight. One row per fact and no borders: the panel is already a list. */
function Rows({ rows }: { rows: readonly [string, string][] }) {
  return (
    <dl className="m-0 flex flex-col gap-1 text-[12.5px]">
      {rows.map(([label, value], i) => (
        <div key={`${label}-${i}`} className="flex items-baseline justify-between gap-3">
          <dt className="flex-none text-[var(--ot-text-3)]">{label}</dt>
          <dd className="m-0 min-w-0 truncate text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
