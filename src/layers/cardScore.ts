import { Player, EbayComps, COMCListing, CardOpportunityScore, UserConfig } from '../types.js';

/**
 * Score the card market opportunity for a given player.
 * Considers eBay comp trend, COMC ask prices, and budget ceiling.
 * Returns a CardOpportunityScore with a recommended card target and ROI estimate.
 */
// TODO: Implement in Chunk 3
export function scoreCard(
  _player: Player,
  _ebayComps: EbayComps,
  _comcListings: COMCListing[],
  _config: UserConfig
): CardOpportunityScore {
  throw new Error('Not implemented');
}
