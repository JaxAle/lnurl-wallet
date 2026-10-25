// Rechnungen der Tombola (Tombola.tsx) — ohne Oberfläche, damit sie sich testen lassen
import {newTier, type PrizeTier} from '../addons/raffle/lottery'

const zahl = (n: number) => n.toLocaleString('de-DE')

const stufe = (count: number, amountSat: number, label = ''): PrizeTier => ({
  ...newTier(),
  count,
  amountSat,
  label
})

// glatte Beträge für die kleinen Preise; der Rest geht an den Hauptpreis
const glatt = (n: number) => {
  const schritt = n >= 1000 ? 100 : n >= 100 ? 10 : n >= 20 ? 5 : 1
  return Math.floor(n / schritt) * schritt
}

export type Art = 'haupt' | 'klassisch' | 'gleich'

// Verteilung des Topfs t auf n Lose — jedes Los gewinnt etwas; Rundungsrest geht an den Hauptpreis.
// null: geht mit diesen Zahlen nicht (zu wenige Lose oder ein Los käme unter 1 Sat)
export const verteile = (
  art: Art,
  t: number,
  n: number
): PrizeTier[] | null => {
  if (n < 1 || t < n) return null
  if (art === 'gleich') return [stufe(n, Math.floor(t / n))]
  if (art === 'haupt') {
    if (n < 2) return [stufe(1, t, 'Hauptpreis')]
    const klein = glatt(Math.floor((t * 0.5) / (n - 1)))
    if (klein < 1) return null
    return [stufe(1, t - (n - 1) * klein, 'Hauptpreis'), stufe(n - 1, klein)]
  }
  if (n < 5) return null
  const neben = glatt(Math.floor(t * 0.1))
  const klein = glatt(Math.floor((t * 0.3) / (n - 4)))
  if (klein < 1 || neben <= klein) return null
  const haupt = t - 3 * neben - (n - 4) * klein
  return [
    stufe(1, haupt, 'Hauptpreis'),
    stufe(3, neben, 'Preis'),
    stufe(n - 4, klein)
  ]
}

export const ARTEN: {id: Art; titel: string}[] = [
  {id: 'haupt', titel: 'Ein Hauptpreis'},
  {id: 'klassisch', titel: 'Klassisch: ein großer, ein paar kleine'},
  {id: 'gleich', titel: 'Gleich verteilt'}
]

export const zeile = (stufen: PrizeTier[]) =>
  stufen.map(s => `${s.count} × ${zahl(s.amountSat)}`).join(' · ')
export const summe = (stufen: PrizeTier[]) =>
  stufen.reduce((a, s) => a + s.count * s.amountSat, 0)
export const anzahl = (stufen: PrizeTier[]) =>
  stufen.reduce((a, s) => a + s.count, 0)

// Lospreis, damit der Topf gedeckt ist — aufgerundet auf eine runde Zahl
export const lospreis = (t: number, n: number) => {
  const roh = Math.ceil(t / n)
  const schritt = roh < 100 ? 10 : roh < 1000 ? 50 : 100
  return Math.ceil(roh / schritt) * schritt
}
