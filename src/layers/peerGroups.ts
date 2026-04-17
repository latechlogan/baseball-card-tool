import type { Player, LevelPeerGroup, PercentileContext } from '../types.js'

function percentileRank(sortedArr: number[], value: number): number {
  if (sortedArr.length === 0) return 0.5
  const below = sortedArr.filter(v => v < value).length
  return below / sortedArr.length
}

export function buildPeerGroups(players: Player[]): LevelPeerGroup[] {
  const levels = ['A', 'A+', 'AA', 'AAA'] as const
  const sorted = (vals: number[]) => [...vals].sort((a, b) => a - b)

  return levels.map(level => {
    const peers = players.filter(p => p.level === level)
    return {
      level,
      players: peers,
      percentiles: {
        iso:    sorted(peers.map(p => p.stats.iso)),
        obp:    sorted(peers.map(p => p.stats.obp)),
        ops:    sorted(peers.map(p => p.stats.ops)),
        kPct:   sorted(peers.map(p => p.stats.kPct)),
        bbPct:  sorted(peers.map(p => p.stats.bbPct)),
        xbhPct: sorted(peers.filter(p => p.stats.xbhPct != null).map(p => p.stats.xbhPct as number)),
      }
    }
  })
}

export function getPercentileContext(player: Player, groups: LevelPeerGroup[]): PercentileContext {
  const group = groups.find(g => g.level === player.level)

  if (!group || group.players.length < 3) {
    return {
      isoPercentile:    0.5,
      obpPercentile:    0.5,
      opsPercentile:    0.5,
      kPctPercentile:   0.5,
      bbPctPercentile:  0.0,
      xbhPctPercentile: 0.5,
    }
  }

  const p = group.percentiles
  const s = player.stats

  const bbPctPercentile = (player.level === 'AA' || player.level === 'AAA')
    ? percentileRank(p.bbPct, s.bbPct)
    : 0.0

  const xbhPctPercentile = s.xbhPct != null
    ? percentileRank(p.xbhPct, s.xbhPct)
    : 0.5

  return {
    isoPercentile:    percentileRank(p.iso, s.iso),
    obpPercentile:    percentileRank(p.obp, s.obp),
    opsPercentile:    percentileRank(p.ops, s.ops),
    kPctPercentile:   1 - percentileRank(p.kPct, s.kPct),
    bbPctPercentile,
    xbhPctPercentile,
  }
}
