// Offene Rechnungen selbst abholen (Gerhard am Pixel, 2026-10-16): wer den Aufladen-Bildschirm schließt,
// bevor der Schein abgeholt ist, fand ihn bisher nur über „Scheine wiederfinden“. Jetzt merkt sich die
// Wallet beim Erstellen der Rechnung, wo und unter welcher Nummer der Schein entsteht — Stelle, Nummer,
// Betrag, kein Geheimnis: das wird bei Bedarf neu aus den zwölf Wörtern abgeleitet, genau wie beim
// Wiederfinden (recovery.ts). Die Prüfwache fragt die Stelle nach dem Schein; ist die Rechnung bezahlt,
// kennt sie ihn, und die Wallet legt ihn ab. Nur pub/sig-Scheine (ck1) — nur die sind ableitbar.
import {createSignal} from 'solid-js'

import {cashAddressSecretAtIndex} from '../cashSecrets'
import {
  buildNoteUrl,
  encodeCk1,
  fetchNoteInfo,
  k1SpendsNote,
  noteK1,
  NoteSpentError,
  NoteUnknownError,
  serverOf,
  signNoteOwnership
} from '../lnurlcash'
import type {Bearer} from '../storage'
import type {WalletContextType} from '../WalletContext'

export type Rechnung = {
  pr: string // die Rechnung selbst (öffentlich) — Schlüssel des Auftrags
  host: string
  index: number
  withdrawLink: string
  netMsat: number
  seit: number
}

const SCHLUESSEL = 'fork_offene_rechnungen'
// eine Rechnung, die nach einem Tag nicht bezahlt ist, wird es nicht mehr — still vergessen
// (der Schein bliebe trotzdem über „Scheine wiederfinden“ auffindbar)
export const HOECHSTENS_MS = 24 * 60 * 60 * 1000

const lies = (): Rechnung[] => {
  try {
    const l = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]')
    return Array.isArray(l) ? (l as Rechnung[]) : []
  } catch {
    return []
  }
}
const [offeneRechnungen, setzeListe] = createSignal<Rechnung[]>(lies())
export {offeneRechnungen}
const schreibe = (l: Rechnung[]) => {
  setzeListe(l)
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(l))
  } catch {
    // ohne Speicher bleibt nur das Wiederfinden
  }
}

export const merkeRechnung = (r: Rechnung) => {
  if (!offeneRechnungen().some(x => x.pr === r.pr))
    schreibe([...offeneRechnungen(), r])
}
export const vergissRechnung = (pr: string) =>
  schreibe(offeneRechnungen().filter(x => x.pr !== pr))

// die Rechnung, die gerade auf dem Aufladen-Bildschirm steht — die holt der Bildschirm selbst ab;
// die Prüfwache lässt sie in Ruhe, sonst lägen am Ende zwei Einträge für einen Schein da
const [aufDemSchirm, setzeAufDemSchirm] = createSignal<string | null>(null)
export {aufDemSchirm, setzeAufDemSchirm}

// der Schein dieser Rechnung, aus den Wörtern abgeleitet (wie recovery.ts onFound)
export const scheinDerRechnung = (
  r: Rechnung
): {ck1: string; pubkeyXOnly: Uint8Array} | null => {
  const secretKey = cashAddressSecretAtIndex(r.host, r.index)
  if (!secretKey) return null // gesperrt — später
  const {pubkeyXOnly, signature} = signNoteOwnership(secretKey, r.host)
  return {ck1: encodeCk1(pubkeyXOnly, signature), pubkeyXOnly}
}

type Kontext = Pick<WalletContextType, 'addBearer' | 'logActivity'>

export const holeRechnungAb = async (
  r: Rechnung,
  alle: () => Bearer[],
  ctx: Kontext,
  jetzt = Date.now()
): Promise<'abgeholt' | 'offen' | 'vergessen'> => {
  const schein = scheinDerRechnung(r)
  if (!schein) return 'offen'
  // schon in der Wallet (der Bildschirm hat ihn doch noch geholt): Auftrag erledigt
  const gehalten = () =>
    alle().some(
      b =>
        serverOf(b.url) === r.host &&
        k1SpendsNote(noteK1(b.url), schein.pubkeyXOnly)
    )
  if (gehalten()) {
    vergissRechnung(r.pr)
    return 'vergessen'
  }
  try {
    const info = await fetchNoteInfo(
      buildNoteUrl(r.withdrawLink, schein.ck1, r.netMsat)
    )
    // während der Nachfrage doch noch vom Bildschirm abgeholt: nicht zweimal ablegen
    if (gehalten()) {
      vergissRechnung(r.pr)
      return 'vergessen'
    }
    await ctx.addBearer({
      url: buildNoteUrl(r.withdrawLink, schein.ck1, info.maxWithdrawable),
      callback: info.callback,
      amount: info.maxWithdrawable,
      verified: true,
      mintPubkey: info.mintPubkey
    })
    vergissRechnung(r.pr)
    ctx.logActivity(
      'mint',
      `${Math.floor(info.maxWithdrawable / 1000)} Sats aufgeladen bei ${r.host} (pub/sig) — abgeholt, nachdem der Aufladen-Bildschirm zu war.`
    )
    return 'abgeholt'
  } catch (err) {
    // ausgegeben: anderswo schon abgeholt (z. B. Wiederfinden) — erledigt.
    // unbekannt: noch nicht bezahlt — nach einem Tag still vergessen.
    // keine Antwort: weiter versuchen, höchstens eine Woche.
    if (
      err instanceof NoteSpentError ||
      (err instanceof NoteUnknownError && jetzt - r.seit > HOECHSTENS_MS) ||
      jetzt - r.seit > 7 * HOECHSTENS_MS
    ) {
      vergissRechnung(r.pr)
      return 'vergessen'
    }
    return 'offen'
  }
}
