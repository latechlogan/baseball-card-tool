import 'dotenv/config'
import { runCalibration } from './calibrate.js'
import { getUserConfig } from '../config.js'

const config = getUserConfig()

const cases = [
  { name: 'Evan Carter',     buyDate: '2022-04-20', outcome: 'hit'  as const },
  { name: 'Dylan Carlson',   buyDate: '2018-06-15', outcome: 'hit'  as const },
  { name: 'Jordan Groshans', buyDate: '2020-10-13', outcome: 'miss' as const },
]

console.log('Running calibration cases...\n')

for (const c of cases) {
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`${c.name} — Buy date: ${c.buyDate} — Expected: ${c.outcome.toUpperCase()}`)
  console.log('═'.repeat(55))

  const report = await runCalibration(c.name, c.buyDate, c.outcome, config)

  console.log(`Player found:    ${report.playerFound}`)
  console.log(`Eligible:        ${report.eligible}`)
  console.log(`Player score:    ${report.playerScore?.score ?? 'N/A'} (${report.playerScore?.confidence ?? 'N/A'})`)
  console.log(`Flags:           ${report.playerScore?.flags.join(', ') || 'none'}`)
  console.log(`Would signal:    ${report.wouldSignal}`)
  console.log(`Model verdict:   ${report.modelVerdict}`)
  if (report.statLine) {
    console.log(`Stat line:       OPS ${report.statLine.ops.toFixed(3)} | ISO ${report.statLine.iso.toFixed(3)} | K% ${(report.statLine.kPct * 100).toFixed(1)}% | PA ${report.statLine.pa}`)
  }
  console.log(`\nContext:`)
  console.log(report.notes)
}

console.log('\n\nCalibration complete. Reports written to data/calibration/')
