// Einen Schein über genau einen Betrag beschaffen — aus Senden herausgezogen (2026-10-17), damit die
// Geschenkkarte denselben, am Pixel belegten Weg geht: passender Schein, sonst vom kleinsten
// größeren abspalten; vorher prüfen, ob die Stelle erreichbar ist (Firmen-WLAN, 2026-10-13), und ein
// unklares Teilen als Vorgang festhalten (klaerung.ts).
import {serverOf} from '../lnurlcash'
import {splitBearerIntoAmounts} from '../noteSplitting'
import type {Bearer} from '../storage'
import {merkeTeilGebuehr} from './gebuehren'
import {beobachte, erreichbar, nichtErreichbar} from './klaerung'

type Ctx = Parameters<typeof splitBearerIntoAmounts>[2] & {
  bearers: () => Bearer[]
}

// genau passender Schein, sonst der kleinste, von dem sich der Betrag abspalten lässt
// (Spalten verlangt einen Rest: Betrag < Schein)
export const waehleSchein = (
  verfuegbar: Bearer[],
  msat: number
): Bearer | null => {
  const passend = verfuegbar.find(b => b.amount === msat)
  if (passend) return passend
  const groessere = verfuegbar
    .filter(b => b.amount > msat)
    .sort((a, b) => a.amount - b.amount)
  return groessere[0] ?? null
}

// den Schein über msat liefern; null = nicht entstanden (unklar → als Vorgang festgehalten)
export const scheinUeber = async (
  quelle: Bearer,
  msat: number,
  ctx: Ctx
): Promise<Bearer | null> => {
  if (quelle.amount === msat) return quelle
  const host = serverOf(quelle.url)
  if (!(await erreichbar(host))) throw new Error(nichtErreichbar(host))
  const {bearers, ...rest} = ctx
  let ergebnis: Awaited<ReturnType<typeof splitBearerIntoAmounts>> | undefined
  await beobachte('teilen', [quelle], bearers, async () => {
    ergebnis = await splitBearerIntoAmounts(
      quelle,
      [{amountMsat: msat}],
      rest,
      {
        plain: false
      }
    )
  })
  if (!ergebnis) return null
  merkeTeilGebuehr(host, ergebnis.lastFeeMsat)
  return ergebnis.parts[0]
}
