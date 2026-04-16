/**
 * ai.ts — Claude API client module.
 *
 * This is the ONLY place in the codebase that calls the Anthropic API directly.
 * All other modules that need AI capabilities must call functions exported from here.
 * This boundary keeps API key management, prompt versioning, and token accounting
 * centralized and auditable.
 *
 * TODO (Chunk N): Initialize the Anthropic SDK client here and implement each function.
 */

export const aiClient = {
  /**
   * Summarize free-form text (e.g., Reddit posts, eBay listing titles) into a
   * concise, structured string suitable for downstream scoring.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  summarize: async (_text: string): Promise<string> => {
    throw new Error('Not implemented');
  },

  /**
   * Classify the sentiment of a body of text and return a structured label
   * (e.g., 'rising' | 'stable' | 'declining') with optional confidence metadata.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  classifySentiment: async (_text: string): Promise<string> => {
    throw new Error('Not implemented');
  },

  /**
   * Run a calibration pass — compare predicted scores against known outcomes
   * and return suggested threshold adjustments.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  calibrate: async (_data: unknown): Promise<unknown> => {
    throw new Error('Not implemented');
  },
};
