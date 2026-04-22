# Baseball Card Flip Tool

An AI-powered pipeline that identifies high-upside minor league prospect cards to buy before a market breakout. It pulls MiLB stats from the MLB Stats API, scores each prospect on analytics, cross-references card market data from CardSight AI, and layers in hobby community sentiment via Claude web search. The result is a ranked buy list with timing signals — BUY NOW, WATCH, or AVOID — updated each run.

## How It Works

The tool runs three scoring layers and combines them into a final composite score:

1. **Player Score** — MiLB stats (OPS, ISO, K%, BB/K) run through a percentile engine that controls for age vs. level, PA sample size, and strikeout ceiling. Source: MLB Stats API (free, no key required).

2. **Card Opportunity Score** — CardSight AI identifies the target card (Bowman Chrome 1st by default), returns recent sale comps, and scores trend direction, pricing vs. budget ceiling, and estimated ROI.

3. **Sentiment Score** — Claude performs a targeted web search to assess hobby community awareness. Lower awareness = higher score = better buying opportunity before the crowd catches on.

---

## Score Reference

All scores are 0–100. Higher is always better.

### Player Score
Pure analytics — MiLB stats run through the percentile scoring engine.

| Range | Meaning |
|-------|---------|
| 70–100 | Exceptional — young for level, elite percentile ranks, full PA sample |
| 45–69 | Strong — clear age advantage or elite metrics — BUY NOW territory |
| 25–44 | Solid — above average analytics — WATCH territory |
| 1–24  | Weak — eligible but limited signal |
| 0     | Ineligible — failed a hard filter (K%, PA, age ceiling) |

Practical ceiling: ~75. A score of 100 would require a player 2+ years younger
than their level ceiling, 95th+ percentile on every metric at AAA, and 200+ PA.
Evan Carter scored 59 in April 2022 (BUY NOW). Dylan Carlson scored 45 in June 2018 (BUY NOW).

### Card Score
Card market opportunity — trend direction, price vs. budget, player alignment.

| Range | Meaning |
|-------|---------|
| 70–100 | Strong opportunity — rising trend with confidence, affordable, strong player |
| 40–69  | Decent — some positive signals |
| 20–39  | Weak — no pricing data, falling trend, or near budget ceiling |
| 0      | Card not found or exceeds budget ceiling |

### Sentiment Score
Hobby community awareness — lower awareness = higher score = better buying opportunity.

| Score | Awareness Level | Meaning |
|-------|----------------|---------|
| 85    | Unknown        | Not on hobby radar — best entry window |
| 60    | Emerging       | Starting to get noticed — window narrowing |
| 25    | Well known     | Hobby community aware — limited alpha |
| 5     | Peak hype      | Major news/contract/debut — alpha gone |

### Final Score
Weighted composite: Player (50%) + Card (30%) + Sentiment (20%).

| Range | Meaning |
|-------|---------|
| 60–100 | Strong signal across all three layers |
| 40–59  | Decent — at least one strong layer |
| 20–39  | Weak — limited signal |

### Timing Signals
- 🟢 BUY NOW — strong multi-layer alignment, move quickly
- 🟡 WATCH — monitor, not yet actionable or window uncertain
- 🔴 AVOID — falling market, peak hype, exceeds budget, or insufficient analytics

---

## Setup

1. Clone the repo and install dependencies:
```bash
npm install
```

2. Create a `.env` file in the project root:
```
ANTHROPIC_API_KEY=your_key_here
CARDSIGHT_API_KEY=your_key_here
```

3. Both keys are required. The Anthropic key powers sentiment analysis via
   web search. The CardSight key powers card market data.
   - Anthropic: https://console.anthropic.com
   - CardSight: https://cardsight.ai

---

## Running the Tool

### Full pipeline run
```bash
npm run pipeline:2025    # 2025 season (retrospective)
npm run pipeline:2026    # 2026 season (live — meaningful after ~June)
```

### Skip sentiment for a fast run (uses cached or neutral sentiment)
```bash
npm run pipeline:2025 -- --skip-sentiment
```

### Regenerate buy list from existing pipeline output
```bash
npm run buylist
```

### Calibration — validate scoring model against historical case studies
```bash
npm run calibrate
```

### Data sources
- **MLB Stats API** — MiLB player stats (free, no key required)
- **CardSight AI** — Card identification and pricing (API key required)
- **Claude web search** — Hobby awareness sentiment (API key required)

---

## Configuration

All scoring thresholds live in `config/thresholds.json`. Edit directly and
re-run the pipeline to see how rankings change. Key values:

- `minPA` — minimum plate appearances to be eligible (default: 150)
- `kPctMax` — maximum strikeout rate (default: 0.20 = 20%)
- `ageVsLevelTable` — maximum age per level (hard ceiling, not soft penalty)
- `playerScoreWeight` / `cardScoreWeight` / `sentimentScoreWeight` — layer weights

Budget ceiling lives in `config/budget.json`:
- `budgetCeiling` — cards above this price are flagged (default: $26)

---

## Build Plan

- [x] Chunk 1  — Project scaffold & config system
- [x] Chunk 2  — Player scoring engine
- [x] Chunk 3  — MLB Stats API fetcher
- [x] Chunk 4  — Pipeline integration
- [x] Chunk 5  — CardSight AI card market data
- [x] Chunk 6  — Card opportunity scorer
- [x] Chunk 7  — Composite scorer & pipeline wiring
- [x] Chunk 8  — Sentiment layer (Claude web search)
- [x] Chunk 9  — Three-layer pipeline integration
- [x] Chunk 10 — Markdown buy list output
- [x] Chunk 11 — Calibration module
- [x] Chunk 12 — Final cleanup & documentation
