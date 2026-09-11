import { type Hex, decodeFunctionData, maxUint256, toFunctionSignature } from 'viem'
import {
  type Call,
  type DecodedAction,
  type Intent,
  type Simulation,
  type TradeIntent,
  type TransferIntent,
  type Warning,
  accountOn,
  chainName,
  crossesChains,
  isNativeAsset,
  parseAccountId,
  parseAssetId,
  parseChainId,
  sameChain,
  sourceAssetOf,
  sourceChainOf,
} from '../core/index.js'
import { KNOWN_ABI, KNOWN_BY_SELECTOR } from './abi.js'

/**
 * Does this plan do what the intent says?
 *
 * The route provider, the agent and the decoder are all untrusted inputs, so
 * the check has to be ours, and it runs after decoding and before hashing: a
 * plan that fails never gets a review link. The rules are small for a
 * transfer, which is the point of landing the layer now. Swap (#22) and
 * agent-crafted plans (#78) add rules here rather than checking themselves.
 *
 * A reason is a sentence a person can read. The agent gets it back and the
 * review page shows it, so "amount mismatch" is not good enough.
 */

export interface VerifyInput {
  intent: Intent
  calls: readonly Call[]
  decodedActions: readonly DecodedAction[]
  /**
   * Spenders the intent legitimately needs — a swap's router, a supply's pool.
   * A transfer names none, so any approval in a transfer plan is blocked.
   */
  allowedSpenders?: readonly string[]
  /**
   * What the simulation observed, when one ran. Null or absent is "not
   * observed" and never counts against a plan: a chain no simulator serves
   * still gets reviewed, on the decoded intent alone.
   */
  simulation?: Simulation | null
  /**
   * The route's own promise, from the quote. A swap is reviewed on its floor,
   * so the policy checks the floor is coherent before a page can show it.
   */
  quote?:
    | {
        expectedOut?: string | undefined
        minOut?: string | undefined
        /** Native value the route declared it needs alongside a token input. */
        nativeFee?: string | undefined | null
      }
    | undefined
}

export type Verdict =
  | { ok: true; warnings: Warning[] }
  | { ok: false; reasons: string[]; warnings: Warning[] }

type Finding = { block: string } | { warn: Warning }

type Rule = (input: VerifyInput) => Finding[]

const short = (caip10: string) => {
  const { address } = parseAccountId(caip10)
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * What the calldata says, read here and not taken from the decoded action.
 *
 * The decoded actions are evidence for the page. The policy must not trust
 * them for anything it can read itself: if the actions and the calls ever
 * disagreed — a bug, or a tampered plan — a check that read the actions
 * would pass the calldata it never looked at. Only the shipped ABI is used,
 * because only the shipped ABI is ours.
 */
interface Read {
  signature: string
  args: readonly unknown[]
}

function readCalldata(call: Call): Read | null {
  if (call.data === '0x' || call.data === '') return null
  const item = KNOWN_BY_SELECTOR.get(call.data.slice(0, 10))
  if (!item) return null
  try {
    const { args } = decodeFunctionData({ abi: KNOWN_ABI, data: call.data as Hex })
    return { signature: toFunctionSignature(item), args: args ?? [] }
  } catch {
    return null
  }
}

/** An approval the calldata itself carries, by the same reading the decoder uses. */
function approvalIn(call: Call): { spender: string; amount: bigint | 'unlimited' } | null {
  const read = readCalldata(call)
  if (!read) return null
  const chain = parseChainId(call.chainId)
  switch (read.signature) {
    case 'approve(address,uint256)':
    case 'increaseAllowance(address,uint256)': {
      const amount = read.args[1] as bigint
      return { spender: accountOn(chain, String(read.args[0])), amount: amount === maxUint256 ? 'unlimited' : amount }
    }
    case 'setApprovalForAll(address,bool)':
      return read.args[1] === true ? { spender: accountOn(chain, String(read.args[0])), amount: 'unlimited' } : null
    default:
      return null
  }
}

/**
 * How much goes in, when the intent fixes it. Null for a trade quoted by its
 * output, and for anything with no fixed input to measure against.
 */
function amountInOf(intent: Intent): bigint | null {
  if (intent.kind === 'swap' || intent.kind === 'bridge') {
    return intent.amountIn === undefined ? null : BigInt(intent.amountIn)
  }
  return BigInt(intent.amount)
}

/** The calls and their decodings must pair up, or nothing below means anything. */
const pairing: Rule = ({ calls, decodedActions }) =>
  calls.length === decodedActions.length
    ? []
    : [{ block: `${calls.length} calls but ${decodedActions.length} decoded actions; the plan cannot be checked` }]

/**
 * The evidence must describe the calls it is attached to. Where the calldata
 * is something we can read ourselves, the decoded action has to say the same
 * — same target, same function, same arguments. Evidence that disagrees with
 * its calldata is either a decoder bug or a plan edited after decoding, and
 * both are reasons to stop.
 */
const evidenceMatchesCalls: Rule = ({ calls, decodedActions }) => {
  const findings: Finding[] = []
  calls.forEach((call, i) => {
    const action = decodedActions[i]
    if (!action) return
    if (action.target.toLowerCase() !== call.to.toLowerCase()) {
      findings.push({ block: `decoded action ${i + 1} describes ${short(action.target)}, but the call targets ${short(call.to)}` })
      return
    }
    if (action.value !== call.value) {
      findings.push({ block: `decoded action ${i + 1} says ${action.value} wei, but the call carries ${call.value}` })
    }
    const read = readCalldata(call)
    if (read === null) {
      if ((call.data === '0x' || call.data === '') && action.source !== 'native') {
        findings.push({ block: `decoded action ${i + 1} is ${action.function}, but the call carries no calldata` })
      }
      return
    }
    if (action.function !== read.signature) {
      findings.push({ block: `decoded action ${i + 1} is ${action.function}, but the calldata is ${read.signature}` })
      return
    }
    const mismatch = read.args.findIndex((v, j) => {
      const shown = action.args[j]?.value
      const actual = typeof v === 'bigint' ? v.toString() : typeof v === 'string' ? v.toLowerCase() : String(v)
      return shown !== actual
    })
    if (mismatch !== -1) {
      findings.push({ block: `decoded action ${i + 1} shows ${action.args[mismatch]?.name ?? `arg ${mismatch}`} as ${action.args[mismatch]?.value}, but the calldata says otherwise` })
    }
  })
  return findings
}

const sameChainAsIntent: Rule = ({ intent, calls }) => {
  const chain = sourceChainOf(intent)
  return calls
    .filter((c) => !sameChain(parseChainId(c.chainId), chain))
    .map((c) => ({ block: `a call targets ${chainName(c.chainId)}, but the intent is on ${chainName(chain)}` }))
}

/**
 * A delegatecall runs someone else's code as the wallet. Nothing a route
 * provider builds for a transfer or a swap needs one; anything that carries
 * one is not a plan we can explain. The check reads the decoded name, which
 * is what we have before simulation (#23) can see the call tree.
 */
const noDelegatecall: Rule = ({ decodedActions }) =>
  decodedActions
    .filter((a) => /delegat/i.test(a.function))
    .map((a) => ({ block: `${a.function} on ${short(a.target)} is a delegatecall, which is never allowed` }))

/**
 * Approvals are read off the calldata. The decoded action's approval is
 * consulted only where the calldata is not ours to read, so an approval a
 * verified ABI revealed still counts, while one the evidence merely claims
 * cannot hide a different one in the bytes.
 */
const approvals: Rule = ({ calls, decodedActions, allowedSpenders = [] }) => {
  const allowed = new Set(allowedSpenders.map((s) => s.toLowerCase()))
  const findings: Finding[] = []
  calls.forEach((call, i) => {
    const fromCalldata = approvalIn(call)
    const approval =
      fromCalldata ??
      (readCalldata(call) === null && decodedActions[i]?.approval
        ? { spender: decodedActions[i]!.approval!.spender, amount: decodedActions[i]!.approval!.amount }
        : null)
    if (!approval) return
    const { spender, amount } = approval
    if (amount === 'unlimited') {
      findings.push({ block: `an unlimited approval to ${short(spender)}; approvals are exact or nothing` })
    }
    if (!allowed.has(spender.toLowerCase())) {
      findings.push({ block: `an approval to ${short(spender)}, which the intent does not name` })
    }
  })
  return findings
}

/**
 * Native value only where the intent spends the chain's own currency. A
 * token transfer carrying ETH is ETH leaving the wallet that nobody asked
 * to send.
 */
const nativeValue: Rule = ({ intent, calls, quote }) => {
  if (isNativeAsset(sourceAssetOf(intent))) return []
  const declared = quote?.nativeFee ? BigInt(quote.nativeFee) : 0n
  const findings: Finding[] = []
  let allowance = declared
  for (const call of calls) {
    if (call.value === '0') continue
    const value = BigInt(call.value)
    // Spend the declaration once. A route that declared a fee does not get
    // to charge it on every call in the batch.
    if (value <= allowance) {
      allowance -= value
      findings.push({
        warn: {
          severity: 'caution' as const,
          code: 'route_native_fee',
          message: `this route also sends ${call.value} wei of ${chainName(call.chainId)}'s own currency as its fee`,
        },
      })
      continue
    }
    findings.push({
      block:
        declared === 0n
          ? `${call.value} wei of native value to ${short(call.to)}, which the intent did not ask for`
          : `${call.value} wei of native value to ${short(call.to)}, above the ${declared} the route declared`,
    })
  }
  return findings
}

/**
 * A simulation that ran and said no.
 *
 * The strongest signal the policy has, and the only one that comes from
 * executing the calls rather than reading them. Blocking here rather than
 * warning: a plan the chain has already refused cannot be signed into
 * anything but a wasted fee.
 */
const simulationOutcome: Rule = ({ simulation }) => {
  if (!simulation || simulation.success) return []
  const which = simulation.failedCall ? `call ${simulation.failedCall}` : 'the batch'
  const why = simulation.revertReason ? `: ${simulation.revertReason}` : ''
  return [{ block: `the simulation failed on ${which}${why}` }]
}

/**
 * What the simulation saw leave, against what the plan says leaves.
 *
 * This is the one check that can catch a call whose bytes are honest and
 * whose effect is not — a token whose `transfer` moves a second balance, a
 * proxy pointing somewhere new. The decoder reads intent; this reads outcome.
 *
 * Asymmetric on purpose. More of the intended asset leaving than the plan
 * promised is unambiguous and blocks. Less, or none observed, only warns:
 * fee-on-transfer and rebasing tokens make the exact figure a bad thing to
 * fail closed on, and nobody is harmed by a plan that moves less than they
 * agreed to. A *different* asset leaving is always a block, whatever its
 * size, because the person never agreed to that one at all.
 */
const simulationMatchesIntent: Rule = ({ intent, simulation, quote }) => {
  if (!simulation || !simulation.success || simulation.assetChanges.length === 0) return []
  const sourceAsset = sourceAssetOf(intent).toLowerCase()
  // A trade quoted by amountOut has no fixed input, so there is no promise to
  // measure against; the other-asset rule below still applies.
  const promised = amountInOf(intent)
  const findings: Finding[] = []
  const mine = simulation.assetChanges.find((c) => c.assetId.toLowerCase() === sourceAsset)

  /**
   * The route's declared native fee. Once trades simulate (Layer 2), the
   * relayer's fee shows up as the chain's own currency leaving the wallet.
   * Without this, every real swap/bridge that pays a native relayer fee is
   * blocked as "an asset the plan does not mention" — the regression Layer 2
   * introduces. The route declares the fee in the quote (nativeValue rule
   * already reads it for the calls), so a native outflow up to that amount is
   * expected and only warns; above it is still a block.
   */
  const declaredNativeFee = quote?.nativeFee ? BigInt(quote.nativeFee) : 0n
  const sourceChain = sourceChainOf(intent)

  for (const change of simulation.assetChanges) {
    if (change.assetId.toLowerCase() === sourceAsset) continue
    if (BigInt(change.diff) >= 0n) continue
    const name = change.symbol ?? change.assetId
    // A native outflow that the route declared as its fee: expected, warn only.
    // Applies only when the input is not already the native asset (if it is,
    // the outflow is measured against the promised amount above, not here).
    if (
      declaredNativeFee > 0n &&
      isNativeAsset(change.assetId) &&
      sameChain(parseChainId(change.assetId.split('/')[0] ?? sourceChain), sourceChain) &&
      -BigInt(change.diff) <= declaredNativeFee
    ) {
      findings.push({
        warn: {
          severity: 'caution' as const,
          code: 'route_native_fee_simulated',
          message: `the simulation shows ${name} leaving as the route's declared relayer fee`,
          saferAlternative: 'This fee was declared in the quote and is expected.',
        },
      })
      continue
    }
    findings.push({
      block: `the simulation shows ${name} leaving the wallet as well, which the plan does not mention`,
    })
  }

  if (promised === null) return findings
  if (!mine) {
    findings.push({
      warn: {
        severity: 'caution' as const,
        code: 'simulation_no_source_change',
        message: 'the simulation did not observe the asset the plan says is being sent',
        saferAlternative: 'Check the decoded call below before signing.',
      },
    })
    return findings
  }
  const left = -BigInt(mine.diff)
  if (left > promised) {
    findings.push({
      block: `the simulation shows ${left} leaving, but the plan says ${promised}`,
    })
  } else if (left < promised) {
    findings.push({
      warn: {
        severity: 'caution' as const,
        code: 'simulation_amount_below_plan',
        message: `the simulation shows ${left} leaving where the plan says ${promised}; the token may take a fee`,
      },
    })
  }
  return findings
}

/** Not blocking, but the page must say it. */
const unverifiedTargets: Rule = ({ decodedActions }) =>
  decodedActions
    .filter((a) => a.isContract && !a.verified)
    .map((a) => ({
      warn: {
        severity: 'caution' as const,
        code: 'unverified_contract',
        message: `${short(a.target)} has no verified source; what it does cannot be read`,
        saferAlternative: 'Prefer a route whose contracts are verified.',
      },
    }))

const unknownCalldata: Rule = ({ decodedActions }) =>
  decodedActions
    .filter((a) => a.source === 'unknown')
    .map((a) => ({
      warn: {
        severity: 'caution' as const,
        code: 'unknown_calldata',
        message: `the call to ${short(a.target)} could not be decoded`,
        saferAlternative: 'Only sign calldata you can read.',
      },
    }))

/**
 * A transfer is one call that moves exactly the asset, exactly the amount, to
 * exactly the recipient. Anything else is a different transaction wearing the
 * intent's name.
 */
const transferRules: Rule = (input) => {
  const intent = input.intent as TransferIntent
  const { calls, decodedActions } = input
  if (calls.length !== 1) {
    return [{ block: `a transfer is one call; this plan has ${calls.length}` }]
  }
  const call = calls[0]!
  const action = decodedActions[0]!
  const recipient = parseAccountId(intent.to).address
  const findings: Finding[] = []

  if (isNativeAsset(intent.asset)) {
    if (parseAccountId(call.to).address !== recipient) {
      findings.push({ block: `the call sends to ${short(call.to)}, not to ${short(intent.to)}` })
    }
    if (call.value !== intent.amount) {
      findings.push({ block: `the call sends ${call.value} wei, but the intent says ${intent.amount}` })
    }
    if (call.data !== '0x' && call.data !== '') {
      findings.push({ block: `a native transfer carries calldata (${action.function}); it should carry none` })
    }
    return findings
  }

  const token = parseAssetId(intent.asset).assetReference
  if (parseAccountId(call.to).address !== token) {
    findings.push({ block: `the call targets ${short(call.to)}, not the token ${short(`${call.chainId}:${token}`)}` })
    return findings
  }
  if (!action.isContract) {
    findings.push({ block: `the token address ${short(call.to)} has no code on ${chainName(call.chainId)}` })
  }
  // Read from the bytes, with our own ABI. The decoded action is not consulted
  // for this: it is what the page shows, and this is what the wallet sends.
  const read = readCalldata(call)
  if (read === null || read.signature !== 'transfer(address,uint256)') {
    findings.push({ block: `the call is ${read?.signature ?? action.function}, not transfer(address,uint256)` })
    return findings
  }
  const to = String(read.args[0]).toLowerCase()
  const amount = String(read.args[1])
  if (to !== recipient) {
    findings.push({ block: `the transfer goes to ${short(`${call.chainId}:${to}`)}, not to ${short(intent.to)}` })
  }
  if (amount !== intent.amount) {
    findings.push({ block: `the transfer moves ${amount}, but the intent says ${intent.amount}` })
  }
  return findings
}

/**
 * A swap is an approval and a router call, or just a router call.
 *
 * The router's calldata is not ours to read — every aggregator encodes its
 * own — so the checks here are the ones that hold whatever the bytes say:
 * how much is approved, to whom, that the approved spender is the contract
 * actually called, that native value only moves when the input is native,
 * and that the quote commits to a floor. What the calls *do* is the
 * simulation's job, and the rule above already blocks an asset leaving that
 * the intent never named.
 */
const tradeRules: Rule = (input) => {
  const intent = input.intent as TradeIntent
  const { calls, decodedActions } = input
  const findings: Finding[] = []

  if (calls.length === 0 || calls.length > 2) {
    return [{ block: `a trade is one router call, with an approval at most; this plan has ${calls.length}` }]
  }
  const router = calls[calls.length - 1]!
  const routerAction = decodedActions[calls.length - 1]
  const nativeIn = isNativeAsset(intent.from)

  if (routerAction && !routerAction.isContract) {
    findings.push({ block: `the trade targets ${short(router.to)}, which has no code on ${chainName(router.chainId)}` })
  }

  /**
   * Layer 1: Calldata rule — a trade's last call must not be a plain transfer.
   *
   * A router's calldata is opaque to us, but a transfer is not. A malicious
   * route provider can quote a swap and send `USDC.transfer(attacker, amount)`
   * as the only call; the shape rules pass (one call, no approval, the target
   * is a contract), and the fabricated minOut makes the page read as a verified
   * swap. Reading the bytes ourselves blocks this outright, with no simulation
   * needed, and it still holds on a chain nothing can simulate.
   *
   * transferFrom is included for the same reason: a plan that pulls from the
   * wallet to a recipient the intent never named is a transfer in router's
   * clothing. The approval rule already catches an approval that does not match
   * the called contract, so a transferFrom to a third party is the remaining
   * shape.
   */
  const routerRead = readCalldata(router)
  if (routerRead && (routerRead.signature === 'transfer(address,uint256)' || routerRead.signature === 'transferFrom(address,address,uint256)')) {
    const recipient = routerRead.signature === 'transfer(address,uint256)' ? String(routerRead.args[0]) : String(routerRead.args[1])
    findings.push({
      block: `the trade's last call is a ${routerRead.signature} to ${short(`${router.chainId}:${recipient}`)}, which moves the input to a single recipient rather than executing a swap; a trade must call a router, not a token transfer`,
    })
  }

  // The approval, if the plan carries one, read off the calldata.
  const approval = calls.length === 2 ? approvalIn(calls[0]!) : null
  if (calls.length === 2 && !approval) {
    findings.push({ block: 'the first of two calls in a trade must be the approval; this one is not' })
  }

  if (nativeIn) {
    if (approval) {
      findings.push({ block: 'the input is the chain’s own currency, which cannot be approved and needs no allowance' })
    }
    if (intent.amountIn !== undefined && router.value !== intent.amountIn) {
      findings.push({ block: `the call sends ${router.value} wei, but the intent says ${intent.amountIn}` })
    }
  } else if (approval) {
    // Exact, and for the contract we are about to call. An allowance to
    // somewhere other than the target is the shape a drain takes.
    if (approval.amount === 'unlimited') {
      findings.push({ block: `an unlimited approval to ${short(approval.spender)}; a trade approves exactly what it spends` })
    } else if (intent.amountIn !== undefined && approval.amount !== BigInt(intent.amountIn)) {
      findings.push({
        block: `the plan approves ${approval.amount} but the intent spends ${intent.amountIn}; a trade approves exactly what it spends`,
      })
    }
    if (parseAccountId(approval.spender).address !== parseAccountId(router.to).address) {
      findings.push({
        block: `the approval lets ${short(approval.spender)} spend, but the call goes to ${short(router.to)}`,
      })
    }
    const token = parseAssetId(intent.from).assetReference
    if (parseAccountId(calls[0]!.to).address !== token) {
      findings.push({ block: `the approval is on ${short(calls[0]!.to)}, not on the token being spent` })
    }
  }

  // The floor is what the review page promises, so it has to be real.
  const { expectedOut, minOut } = input.quote ?? {}
  if (minOut === undefined) {
    findings.push({ block: 'the quote gives no minimum received; a trade cannot be reviewed without a floor' })
  } else if (BigInt(minOut) <= 0n) {
    findings.push({ block: 'the quote’s minimum received is zero; that is not a floor' })
  } else if (expectedOut !== undefined && BigInt(minOut) > BigInt(expectedOut)) {
    findings.push({ block: `the quote promises at least ${minOut} but expects only ${expectedOut}` })
  }

  /**
   * Layer 2: A same-chain trade must be traced by a simulation.
   *
   * Asymmetric on purpose. For a transfer, the calldata is the whole story
   * and a simulation is a nice-to-have; for a trade, the router's calldata
   * is opaque to us and the simulation is the only evidence that anything
   * arrived at all. A same-chain swap with no simulation, or with a
   * simulation that did not trace balances, cannot be reviewed on its
   * outcome — and the shape rules alone (Layer 1) cannot tell a real swap
   * from a transfer to an attacker dressed as a router call.
   *
   * Bridges stand down: the output lands on another chain, minutes later, so
   * a source-chain simulation cannot see it and an absent arrival proves
   * nothing. Explicit rather than incidental: the rule is skipped because it
   * cannot apply, not because nobody thought about it.
   */
  const sim = input.simulation
  const isCrossChain = crossesChains(intent)
  if (!isCrossChain) {
    if (!sim) {
      findings.push({
        block: 'a same-chain trade must be simulated before it can be reviewed; no simulation was run',
      })
    } else if (!sim.success) {
      // simulationOutcome already blocks a failed run; this is redundant but
      // keeps the "must be traced" logic in one place for clarity.
    } else if (sim.tracedAssets !== true) {
      findings.push({
        block: 'the simulation ran but did not trace balances; a same-chain trade must be reviewed on traced balance changes, not on shape alone',
      })
    }
  }

  /**
   * Layer 3: A missing output delta counts as zero.
   *
   * The old rule only checked `arrived.diff` when `arrived` existed. If the
   * simulator omitted a zero-change balance (or the malicious route moved the
   * input elsewhere and nothing arrived), `arrived` was undefined and the
   * check silently passed — exactly the reproduction in #92. With
   * `tracedAssets` (Layer 2) guaranteeing the run actually looked, an absent
   * arrival now means "traced, and nothing arrived" — which is zero, and
   * zero is below any positive floor.
   *
   * Bridges still stand down for the same reason as Layer 2.
   */
  if (sim?.success && sim.tracedAssets === true && minOut !== undefined && !isCrossChain) {
    // Net change: a trade may both receive the output and pay a native fee
    // from the same asset (e.g. ETH in -> ETH out with relayer fee). Taking
    // only the first delta would count the fee as the arrival and block every
    // real trade; summing gives the net received, which is what the floor
    // promises.
    const outputDeltas = sim.assetChanges.filter((c) => c.assetId.toLowerCase() === intent.to.toLowerCase())
    const received = outputDeltas.reduce((sum, c) => sum + BigInt(c.diff), 0n)
    if (received < BigInt(minOut)) {
      findings.push({
        block: outputDeltas.length > 0
          ? `the simulation received ${received.toString()} (net of ${outputDeltas.length} balance changes), below the ${minOut} the quote promised`
          : `the simulation traced balances and received 0 of ${intent.to}, below the ${minOut} the quote promised`,
      })
    }
  }
  return findings
}

const GLOBAL: readonly Rule[] = [
  pairing,
  evidenceMatchesCalls,
  sameChainAsIntent,
  noDelegatecall,
  approvals,
  nativeValue,
  simulationOutcome,
  simulationMatchesIntent,
  unverifiedTargets,
  unknownCalldata,
]

const BY_KIND: Readonly<Record<Intent['kind'], readonly Rule[]>> = {
  transfer: [transferRules],
  // One rule set. Everything a swap must satisfy a bridge must too; what
  // differs is only what a source-chain simulation can see.
  swap: [tradeRules],
  bridge: [tradeRules],
  // Supply lands with #79. Until then it fails closed rather than passing on
  // the global rules alone.
  supply: [() => [{ block: 'supply plans cannot be verified yet' }]],
}

export function verifyPlan(input: VerifyInput): Verdict {
  const findings: Finding[] = []
  for (const rule of GLOBAL) findings.push(...rule(input))
  // Intent rules index into the pairing; if the pairing is broken they would
  // be reading the wrong action, so they only run once it holds.
  if (input.calls.length === input.decodedActions.length) {
    for (const rule of BY_KIND[input.intent.kind]) findings.push(...rule(input))
  }

  const reasons = findings.flatMap((f) => ('block' in f ? [f.block] : []))
  const warnings = findings.flatMap((f) => ('warn' in f ? [f.warn] : []))
  return reasons.length === 0 ? { ok: true, warnings } : { ok: false, reasons, warnings }
}

/**
 * The reasons as warnings, so a blocked plan can carry them in its human
 * plan and the review page and Activity show why with no second field.
 */
export function blockWarnings(verdict: Verdict): Warning[] {
  if (verdict.ok) return verdict.warnings
  return [
    ...verdict.reasons.map((reason) => ({ severity: 'block' as const, code: 'verify_failed', message: reason })),
    ...verdict.warnings,
  ]
}
