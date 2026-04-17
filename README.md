# Baseball Card Flip Tool

An AI-powered pipeline that identifies high-upside minor league prospect cards to buy before a market breakout. It scores prospects on statistical performance (wRC+, K%, BB/K, xBH%), cross-references card market data from eBay, and layers in Reddit sentiment analysis to surface time-sensitive buy opportunities within a configurable budget ceiling.

## Build Plan

- [x] **Chunk 1** — Project scaffold, TypeScript types, config schema, cache abstraction
- [ ] **Chunk 2** — FanGraphs scraper + player scoring layer
- [ ] **Chunk 3** — eBay scraper + card opportunity scoring layer
- [ ] **Chunk 4** — Reddit scraper + AI sentiment scoring layer
- [ ] **Chunk 5** — Pipeline orchestration + buy list output renderer
- [ ] **Chunk 6** — Composite scoring + ranking engine
- [ ] **Chunk 7** — AI calibration loop against known outcomes
- [ ] **Chunk 8** — PSA population report integration
- [ ] **Chunk 9** — Two-way player handling and age-vs-level adjustments
- [ ] **Chunk 10** — Print run / parallel tiering in card scoring
- [ ] **Chunk 11** — Confidence interval weighting and PA tier adjustments
- [ ] **Chunk 12** — Full integration testing + calibration validation

## Running

```bash
npm run pipeline   # single run
npm run dev        # watch mode (reruns on file changes)
```

## Configuration

All tuning lives in `/config/*.json` — no code changes needed for threshold adjustments:

| File | Purpose |
|------|---------|
| `config/thresholds.json` | Scoring thresholds (wRC+, K%, BB/K, etc.) and scoring layer weights |
| `config/budget.json` | Budget ceiling, eBay fee estimates |

Config is loaded once via `getUserConfig()` in `src/config.ts` and passed as a parameter to all logic functions. Scoring and scraping modules never import config files directly.
