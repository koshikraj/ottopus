import { ActivityView } from '@/components/activity/activity-view'
import { BubbleField, GUTTER_LIFE, SeaLife } from '@/components/motion'
import { PageColumn, PageHeader } from '@/components/shell'

export const metadata = { title: 'Activity · Ottopus' }

/**
 * #26: what every linked wallet did on chain, whoever prepared it.
 *
 * The feed stands in the review page's water: the same gradient, caustics
 * and gutter creatures, with the column of cards down the middle. The
 * ambient layer is clipped as one so the caustic sheets, which drift past
 * the edges as they wash, never leave a strip of bare page beneath.
 */
export default function Activity() {
  return (
    <>
      <PageColumn>
        <PageHeader title="Activity" detail="What your wallets did on chain, every network together, newest first." />
      </PageColumn>
      <div className="ot-review-sea relative flex flex-1 flex-col overflow-x-clip">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="ot-caustic" />
          <div className="ot-caustic ot-caustic--b" />
          <BubbleField pattern="canvas" />
          <SeaLife creatures={GUTTER_LIFE} />
        </div>
        <PageColumn className="relative flex-1">
          <ActivityView />
        </PageColumn>
      </div>
    </>
  )
}
