import { mkdirSync, writeFileSync } from 'fs'
import type { CalibrationReport, Player, PlayerScore, UserConfig } from '../types.js'
import { fetchMiLBHitters } from '../scrapers/mlbStatsApi.js'
import { buildPeerGroups, getPercentileContext } from '../layers/peerGroups.js'
import { scorePlayer } from '../layers/playerScore.js'
import { assessHistoricalContext } from '../ai.js'

function findPlayer(players: Player[], name: string): Player | null {
  const lower = name.toLowerCase()
  return players.find(p => p.name.toLowerCase() === lower)
      ?? players.find(p => p.name.toLowerCase().includes(lower.split(' ').at(-1)!.toLowerCase()))
      ?? null
}

function deriveHistoricalSignal(
  playerScore: PlayerScore
): 'BUY_NOW' | 'WATCH' | 'AVOID' | 'NOT_FOUND' {
  if (!playerScore.eligible)   return 'AVOID'
  if (playerScore.score >= 45) return 'BUY_NOW'
  if (playerScore.score >= 25) return 'WATCH'
  return 'AVOID'
}

function determineVerdict(
  wouldSignal: string,
  outcome:     'hit' | 'miss'
): 'CORRECT' | 'INCORRECT' | 'INCONCLUSIVE' {
  if (outcome === 'hit' && (wouldSignal === 'BUY_NOW' || wouldSignal === 'WATCH')) return 'CORRECT'
  if (outcome === 'hit' && wouldSignal === 'AVOID')                                 return 'INCORRECT'
  if (outcome === 'miss' && wouldSignal === 'AVOID')                                return 'CORRECT'
  if (outcome === 'miss' && (wouldSignal === 'BUY_NOW' || wouldSignal === 'WATCH')) return 'INCORRECT'
  return 'INCONCLUSIVE'
}

export async function runCalibration(
  playerName: string,
  buyDate:     string,
  outcome:     'hit' | 'miss',
  config:      UserConfig
): Promise<CalibrationReport> {
  const season = new Date(buyDate).getFullYear()
  const slug   = playerName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const referenceDate = new Date(buyDate)
  console.log(`[calibration] Fetching MiLB hitters for ${season} (ages as of ${buyDate})...`)

  let players: Player[] = []
  let fetchError: string | null = null
  try {
    players = await fetchMiLBHitters(season, config, referenceDate)
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err)
    console.warn(`[calibration] MiLB fetch failed for ${season}: ${fetchError}`)
  }

  const player = fetchError ? null : findPlayer(players, playerName)

  let playerScore: PlayerScore | null = null
  let wouldSignal: 'BUY_NOW' | 'WATCH' | 'AVOID' | 'NOT_FOUND' = 'NOT_FOUND'
  let modelVerdict: 'CORRECT' | 'INCORRECT' | 'INCONCLUSIVE' = 'INCONCLUSIVE'
  let eligible = false

  if (fetchError) {
    console.warn(`[calibration] Data unavailable for ${season} — ${fetchError}`)
  } else if (!player) {
    console.warn(`[calibration] Player not found: ${playerName} in ${season} data — likely a data limitation`)
  } else {
    const peerGroups = buildPeerGroups(players)
    const context    = getPercentileContext(player, peerGroups)
    playerScore      = scorePlayer(player, config, context)
    eligible         = playerScore.eligible
    wouldSignal      = deriveHistoricalSignal(playerScore)
    modelVerdict     = determineVerdict(wouldSignal, outcome)
  }

  console.log(`[calibration] Fetching historical context for ${playerName}...`)
  const contextNotes = await assessHistoricalContext(playerName, buyDate, outcome)
  const dataLimitation = fetchError
    ? `DATA LIMITATION: MiLB stats unavailable for ${season} (${fetchError}). Player score could not be computed.\n\n`
    : ''
  const notes = dataLimitation + contextNotes

  const report: CalibrationReport = {
    playerName,
    buyDate,
    outcome,
    season,
    playerFound:  player !== null,
    playerScore,
    eligible,
    wouldSignal,
    modelVerdict,
    statLine:     player?.stats ?? null,
    notes,
    runAt:        new Date().toISOString(),
  }

  mkdirSync('./data/calibration', { recursive: true })
  writeFileSync(
    `./data/calibration/${slug}-${season}.json`,
    JSON.stringify(report, null, 2)
  )

  return report
}
