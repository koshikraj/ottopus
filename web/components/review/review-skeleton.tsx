import { Skeleton, SkeletonText } from '@/components/motion'

/**
 * The card before the plan arrives, in the card's own shape.
 *
 * Shape means measurements, not a vague resemblance: the same padding, the
 * same block order, the same number of rows the real card will have. A loader
 * that is taller or shorter than what replaces it hands the reader a jump at
 * the exact moment they start reading, which is worse than no loader at all.
 * When this file and review-card.tsx disagree, this one is wrong.
 *
 * The session loader already ran once on the way in; a second Otto would be a
 * second wait announced twice. Tide sweeps the headline; the rest holds still.
 */
export function ReviewSkeleton() {
  return (
    <article
      aria-busy
      className="flex flex-col overflow-hidden rounded-[26px] border border-[var(--ot-border-strong)] bg-[var(--ot-card)] shadow-[var(--ot-shadow-card)] sm:rounded-[16px] sm:border-[var(--ot-border)]"
    >
      {/* header: "Review", the reference, the countdown */}
      <header className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-2.5">
        <Skeleton width={52} height={16} sweep={false} />
        <span className="flex items-center gap-2.5">
          <Skeleton width={74} height={12} sweep={false} />
          <Skeleton width={32} height={13} sweep={false} />
        </span>
      </header>

      {/* the summary sentence, then the reason under it */}
      <div className="flex flex-col gap-[3px] px-[18px] pb-3.5">
        <SkeletonText lines={2} lineHeight={20} widths={['94%', '54%']} label="Loading the request" />
        <Skeleton height={13} width="72%" sweep={false} delay={0.2} className="mt-[7px]" />
      </div>

      {/* the amount and, under it, the line of wallet, network and freshness */}
      <div className="flex flex-col gap-2.5 bg-[var(--ot-water-1)] px-[18px] py-3.5">
        <div className="flex items-center gap-[11px]">
          <Skeleton width={36} height={36} radius={999} />
          <div className="flex flex-1 flex-col gap-[5px]">
            <Skeleton width="46%" height={19} sweep={false} />
            <Skeleton width="28%" height={11} sweep={false} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton width={22} height={22} radius={7} sweep={false} />
          <Skeleton width={44} height={12} sweep={false} />
          <Skeleton width={22} height={22} radius={7} sweep={false} delay={0.15} />
          <Skeleton width={40} height={12} sweep={false} delay={0.15} />
          <Skeleton width={78} height={19} radius={999} sweep={false} delay={0.3} />
        </div>
      </div>

      {/* the fee, and the note when the request carried one */}
      <div className="flex flex-col px-[18px]">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between border-b border-[var(--ot-border)] py-[11px]">
            <Skeleton width={i === 0 ? 78 : 34} height={13} sweep={false} />
            <Skeleton width={i === 0 ? 108 : 76} height={13} sweep={false} />
          </div>
        ))}
      </div>

      {/* the signing footer, then the line about never holding a key */}
      <div className="mt-3.5 flex flex-col gap-3 border-t border-[var(--ot-border)] bg-[var(--ot-water-1)] px-[18px] pt-3.5 pb-[18px]">
        <Skeleton height={58} radius={10} sweep={false} />
        <div className="flex gap-2">
          <Skeleton height={44} radius={999} sweep={false} />
          <Skeleton height={44} radius={999} delay={0.4} />
        </div>
        <Skeleton height={11} width="78%" radius={999} sweep={false} className="mx-auto" />
      </div>
    </article>
  )
}
