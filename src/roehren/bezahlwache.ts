// Angestoßene Zahlungen zu Ende führen (Gerhard am Pixel, 2026-10-29: 60 und 50 Sats an Blink galten als
// bezahlt, kamen nie an, und die Stelle hatte die Scheine längst wiederhergestellt). Ein „OK“ der Stelle auf
// meltNote heißt nur „angestoßen“ (lib/request.ts); scheitert die Zahlung, gilt der Schein dort wieder.
// Darum markiert Bezahlen ihn nur als 'zahlung', und hier wird entschieden — nur lesend:
// - Nachweis der Stelle (verify, LUD-21) meldet bezahlt, oder die Stelle kennt den Schein nicht mehr
//   → bezahlt: Verlaufseintrag, Schein verschwindet.
// - Schein nach FRIST noch gültig → gescheitert: zurück in die Wallet, Verlaufseintrag.
// - Stelle meldet „pending“ → die Zahlung hängt dort (Lightning, kann Stunden dauern); der Schein ist
//   gesperrt, bis die Stelle abschließt oder abbricht — sichtbar als 'schwebt', zurückbuchen geht nicht
//   (Pixel 31.10.: 23 Sats aus minty, nach 14 min noch unterwegs, entgegen der 5-Minuten-Zusage).
// - keine Antwort → später wieder.
import {
  fetchInvoiceVerification,
  fetchNoteInfo,
  NoteSpentError,
  NoteWorthZeroError,
  NoteUnknownError,
  PendingNoteError,
  sameInvoice,
  serverOf,
  ServiceError
} from '../lnurlcash'
import type {Bearer} from '../storage'
import {merkeAuszahlung} from './auszahlung'

export const FRIST_MS = 5 * 60 * 1000

type Ctx = {
  updateBearer: (id: string, c: Partial<Omit<Bearer, 'id'>>) => Promise<void>
  removeBearer: (id: string) => void | Promise<void>
  logActivity: (kind: 'melt' | 'unspent', text: string, label?: string) => void
}

export const istZahlung = (b: Bearer): boolean =>
  !!b.spent && b.spentGrund === 'zahlung' && !!b.zahlung

// einmal je Zahlungsversuch abschließen, auch wenn Seite und Wache zugleich fertig werden. Schlüssel ist
// Schein UND Beginn des Versuchs: ein zurückgeholter Schein behält seine id — nach Schein allein wurde ein
// zweiter Versuch mit demselben Schein still übersprungen (Pixel 31.10.: 49er hing 20 min, 23er bis Neuladen)
const erledigt = new Set<string>()
const versuch = (id: string, seit: number) => `${id}:${seit}`
const schonErledigt = (b: Bearer) =>
  !b.zahlung || erledigt.has(versuch(b.id, b.zahlung.seit))

export const bezahlt = async (b: Bearer, ctx: Ctx): Promise<void> => {
  if (schonErledigt(b)) return
  erledigt.add(versuch(b.id, b.zahlung!.seit))
  merkeAuszahlung(serverOf(b.url), true)
  ctx.logActivity(
    'melt',
    `${b.zahlung.text} — von ${serverOf(b.url)} bestätigt.`,
    b.label
  )
  await ctx.removeBearer(b.id)
}

export const gescheitert = async (b: Bearer, ctx: Ctx): Promise<void> => {
  if (schonErledigt(b)) return
  erledigt.add(versuch(b.id, b.zahlung!.seit))
  merkeAuszahlung(serverOf(b.url), false)
  await ctx.updateBearer(b.id, {
    spent: false,
    spentGrund: undefined,
    zahlung: undefined
  })
  ctx.logActivity(
    'unspent',
    `Nicht durchgegangen: ${b.zahlung.text.replace(/ (bezahlt|umgezogen)/, '')} — der Schein (${serverOf(b.url)}) ist wieder in der Wallet.`,
    b.label
  )
}

// wie probeBurnedNote, aber „pending“ eigens: gültig · verbraucht · schwebt · keine Auskunft
const frageSchein = async (
  url: string
): Promise<'live' | 'gone' | 'schwebt' | 'wert0' | 'unknown'> => {
  try {
    await fetchNoteInfo(url)
    return 'live'
  } catch (err) {
    // v0.17: Wert 0 heißt verbrannt ODER mitten im Einschmelzen — für die eigene Zahlung keine Entscheidung;
    // die trifft nur der LUD-21-Nachweis (verify), den v0.17 bei jedem melt-OK mitgibt
    if (err instanceof NoteWorthZeroError) return 'wert0'
    if (err instanceof NoteSpentError || err instanceof NoteUnknownError)
      return 'gone'
    if (err instanceof PendingNoteError) return 'schwebt'
    return 'unknown'
  }
}

// Ein anderer Teil der Wallet hat selbst entschieden (Umziehen-Fenster des Originals): nur die Erfahrung
// merken und den Vermerk lösen, damit die Wache nichts doppelt einträgt. bezahlt: Schein bleibt ausgegeben
// (wie im Original); sonst wurde er dort schon zurückgeholt.
export const quittiere = async (
  b: Pick<Bearer, 'id' | 'url'>,
  seit: number,
  ok: boolean,
  updateBearer: Ctx['updateBearer']
): Promise<void> => {
  if (erledigt.has(versuch(b.id, seit))) return
  erledigt.add(versuch(b.id, seit))
  merkeAuszahlung(serverOf(b.url), ok)
  await updateBearer(b.id, {spentGrund: undefined, zahlung: undefined})
}

// eine Nachfrage für einen Schein; 'offen' = noch nicht entschieden
export const pruefeZahlung = async (
  b: Bearer,
  ctx: Ctx,
  jetzt = Date.now()
): Promise<'bezahlt' | 'gescheitert' | 'offen'> => {
  const z = b.zahlung
  if (!z) return 'offen'
  // v0.17: nach einer gescheiterten Zahlung antwortet der Nachweis „Not found“ und der Schein ist wieder
  // gültig — beides zusammen heißt gescheitert, ohne die Frist abzuwarten (Gerhard, 2026-11-18)
  let nichtGefunden = false
  if (z.verify) {
    try {
      const v = await fetchInvoiceVerification(z.verify)
      if (v.settled && sameInvoice(v.pr, z.pr)) {
        await bezahlt(b, ctx)
        return 'bezahlt'
      }
    } catch (err) {
      // Nachweis nicht erreichbar — der Schein selbst sagt es auch
      nichtGefunden =
        err instanceof ServiceError && /^not found\.?$/i.test(err.reason.trim())
    }
  }
  const roh = await frageSchein(b.url)
  // Wert 0 mit Nachweis: der Nachweis hat oben noch nicht „bezahlt“ gesagt → schwebt; ohne Nachweis (alte
  // Stellen geben nie Wert 0, v0.17 gibt immer verify) bleibt es beim bisherigen „verbraucht = bezahlt“
  const antwort = roh === 'wert0' ? (z.verify ? 'schwebt' : 'gone') : roh
  // „hängt bei der Stelle“ nur bei Wechsel speichern, nicht bei jeder Runde
  const schwebt = antwort === 'schwebt'
  if (!!z.schwebt !== schwebt && !schonErledigt(b))
    await ctx.updateBearer(b.id, {zahlung: {...z, schwebt}})
  if (antwort === 'gone') {
    await bezahlt(b, ctx)
    return 'bezahlt'
  }
  if (antwort === 'live' && (nichtGefunden || jetzt - z.seit > FRIST_MS)) {
    await gescheitert(b, ctx)
    return 'gescheitert'
  }
  return 'offen'
}
