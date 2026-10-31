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
  NoteUnknownError,
  PendingNoteError,
  sameInvoice,
  serverOf
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

// einmal je Schein abschließen, auch wenn Seite und Wache zugleich fertig werden
const erledigt = new Set<string>()

export const bezahlt = async (b: Bearer, ctx: Ctx): Promise<void> => {
  if (erledigt.has(b.id) || !b.zahlung) return
  erledigt.add(b.id)
  merkeAuszahlung(serverOf(b.url), true)
  ctx.logActivity(
    'melt',
    `${b.zahlung.text} — von ${serverOf(b.url)} bestätigt.`,
    b.label
  )
  await ctx.removeBearer(b.id)
}

export const gescheitert = async (b: Bearer, ctx: Ctx): Promise<void> => {
  if (erledigt.has(b.id) || !b.zahlung) return
  erledigt.add(b.id)
  merkeAuszahlung(serverOf(b.url), false)
  await ctx.updateBearer(b.id, {
    spent: false,
    spentGrund: undefined,
    zahlung: undefined
  })
  ctx.logActivity(
    'unspent',
    `Nicht durchgegangen: ${b.zahlung.text.replace(' bezahlt', '')} — der Schein (${serverOf(b.url)}) ist wieder in der Wallet.`,
    b.label
  )
}

// wie probeBurnedNote, aber „pending“ eigens: gültig · verbraucht · schwebt · keine Auskunft
const frageSchein = async (
  url: string
): Promise<'live' | 'gone' | 'schwebt' | 'unknown'> => {
  try {
    await fetchNoteInfo(url)
    return 'live'
  } catch (err) {
    if (err instanceof NoteSpentError || err instanceof NoteUnknownError)
      return 'gone'
    if (err instanceof PendingNoteError) return 'schwebt'
    return 'unknown'
  }
}

// eine Nachfrage für einen Schein; 'offen' = noch nicht entschieden
export const pruefeZahlung = async (
  b: Bearer,
  ctx: Ctx,
  jetzt = Date.now()
): Promise<'bezahlt' | 'gescheitert' | 'offen'> => {
  const z = b.zahlung
  if (!z) return 'offen'
  if (z.verify) {
    try {
      const v = await fetchInvoiceVerification(z.verify)
      if (v.settled && sameInvoice(v.pr, z.pr)) {
        await bezahlt(b, ctx)
        return 'bezahlt'
      }
    } catch {
      // Nachweis nicht erreichbar — der Schein selbst sagt es auch
    }
  }
  const antwort = await frageSchein(b.url)
  // „hängt bei der Stelle“ nur bei Wechsel speichern, nicht bei jeder Runde
  const schwebt = antwort === 'schwebt'
  if (!!z.schwebt !== schwebt && !erledigt.has(b.id))
    await ctx.updateBearer(b.id, {zahlung: {...z, schwebt}})
  if (antwort === 'gone') {
    await bezahlt(b, ctx)
    return 'bezahlt'
  }
  if (antwort === 'live' && jetzt - z.seit > FRIST_MS) {
    await gescheitert(b, ctx)
    return 'gescheitert'
  }
  return 'offen'
}
