// Run with: npm run scraper:mlb
import { fetchMiLBHitters } from './mlbStatsApi.js';
import { getUserConfig } from '../config.js';

const config = getUserConfig();

console.time('fetch');
const players = await fetchMiLBHitters(2025, config);
console.timeEnd('fetch');

console.log(`\nTotal age-eligible players returned: ${players.length}`);

// Level breakdown
const byLevel = players.reduce((acc, p) => {
  acc[p.level] = (acc[p.level] ?? 0) + 1;
  return acc;
}, {} as Record<string, number>);
console.log('\n--- Level breakdown ---');
console.table(byLevel);

// Top 10 by OPS
const top10 = [...players]
  .sort((a, b) => b.stats.ops - a.stats.ops)
  .slice(0, 10);

console.log('\n--- Top 10 by OPS (age-eligible) ---');
console.table(top10.map(p => ({
  name:   p.name,
  org:    p.org,
  level:  p.level,
  age:    p.age,
  pa:     p.stats.pa,
  ops:    p.stats.ops.toFixed(3),
  iso:    p.stats.iso.toFixed(3),
  obp:    p.stats.obp.toFixed(3),
  kPct:   (p.stats.kPct * 100).toFixed(1) + '%',
  bbK:    p.stats.bbKRatio.toFixed(2),
  xbhPct: p.stats.xbhPct != null
            ? (p.stats.xbhPct * 100).toFixed(1) + '%'
            : 'N/A',
  flags:  p.flags.join(', ') || 'none',
})));
