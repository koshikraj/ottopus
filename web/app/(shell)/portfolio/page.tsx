import { PortfolioView } from './portfolio-view'

export const metadata = { title: 'Portfolio · Ottopus' }

/**
 * The frame, with the numbers still to come from #8 and #9.
 *
 * A shell around a client view: the arm list is behind a Privy session held in
 * the browser, so there is nothing for a server render to read. This file
 * exists to keep the metadata export, which a client component cannot have.
 *
 * This is one of the three places water is allowed, and the only one where the
 * gradient, the bubbles and an animated Otto appear together.
 */
export default function Portfolio() {
  return <PortfolioView />
}
