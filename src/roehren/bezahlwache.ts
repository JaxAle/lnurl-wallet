// Angestoßene Zahlungen zu Ende führen (Gerhard am Pixel, 2026-10-29: 60 und 50 Sats an Blink galten als
// bezahlt, kamen nie an, und die Stelle hatte die Scheine längst wiederhergestellt). Ein „OK“ der Stelle auf
// meltNote heißt nur „angestoßen“ (lib/request.ts); scheitert die Zahlung, gilt der Schein dort wieder.
// Darum markiert Bezahlen ihn nur als 'zahlung', und hier wird entschieden — nur lesend:
// - Nachweis der Stelle (verify, LUD-21) meldet bezahlt, oder die Stelle kennt den Schein nicht mehr
//   → bezahlt: Verlaufseintrag, Schein verschwindet.
// - Schein nach FRIST noch gültig → gescheitert: zurück in die Wallet, Verlaufseintrag.
// - keine Antwort → später wieder.
import {fetchInvoiceVerification, sameInvoice, serverOf} from '../lnurlcash'
import {probeBurnedNote} from '../lib/request'
import type {Bearer} from '../storage'

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
  const antwort = await probeBurnedNote(b.url)
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
