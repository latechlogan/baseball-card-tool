import { SentimentScore } from '../types.js';

/**
 * Derive a SentimentScore from raw Reddit/social chatter text for a given player.
 * Delegates AI classification to aiClient — never calls the Anthropic API directly.
 */
// TODO: Implement in Chunk 4
export async function scoreSentiment(_redditPosts: string[]): Promise<SentimentScore> {
  throw new Error('Not implemented');
}
