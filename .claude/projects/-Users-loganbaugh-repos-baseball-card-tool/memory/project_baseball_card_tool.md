---
name: Baseball Card Flip Tool — Project Overview
description: Core facts about what this tool is and how the 12-chunk build is structured
type: project
---

AI-powered baseball card flip tool: identifies high-upside minor league prospect cards to buy before a market breakout. Scores prospects on stats (wRC+, K%, BB/K, xBH%), card market data (eBay/COMC), and Reddit sentiment. Outputs a ranked buy list within a configurable budget ceiling.

**Why:** Personal card flipping workflow automated with AI.

**How to apply:** All new features should fit the 12-chunk plan. Config values are the primary tuning interface — minimize hardcoded numbers in logic files.

Build progress:
- [x] Chunk 1: Scaffold, types, config, cache
- [ ] Chunk 2: FanGraphs scraper + player scoring
- [ ] Chunk 3: eBay + COMC scrapers + card scoring
- [ ] Chunk 4: Reddit scraper + AI sentiment
- [ ] Chunk 5: Pipeline orchestration + buy list output
- [ ] Chunk 6: Composite scoring + ranking
- [ ] Chunk 7: AI calibration loop
- [ ] Chunk 8: PSA population report
- [ ] Chunk 9: Two-way player + age-vs-level adjustments
- [ ] Chunk 10: Print run / parallel tiering
- [ ] Chunk 11: Confidence interval + PA tier weighting
- [ ] Chunk 12: Full integration testing + calibration validation

Key architectural constraints:
- All types exported from `src/types.ts` only — no local type definitions elsewhere
- Config always passed as parameter — never imported inside scoring/scraping modules
- `src/ai.ts` is the ONLY file that calls the Anthropic API directly
- Cache I/O only through `src/cache.ts` — no raw `fs` calls outside that module
- Config files: `config/thresholds.json` and `config/budget.json`
