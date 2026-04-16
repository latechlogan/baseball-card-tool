import { getUserConfig } from './config.js';

/**
 * Main pipeline entry point.
 *
 * Orchestrates the full run:
 *   1. Load config
 *   2. Scrape FanGraphs for prospect stats
 *   3. Score each player (playerScore layer)
 *   4. For eligible players, scrape eBay + COMC and score card opportunity
 *   5. Scrape Reddit and score sentiment
 *   6. Compute composite scores and rank
 *   7. Render buy list output
 */
// TODO: Implement in Chunk 5
async function runPipeline(): Promise<void> {
  const _config = getUserConfig();
  throw new Error('Not implemented');
}

runPipeline().catch((err) => {
  console.error(err);
  process.exit(1);
});
