// Schein zurückholen (Prototyp: „Doch nicht senden, Schein zurückholen“): der übergebene QR wird
// wertlos, der Betrag bleibt in der Wallet. Technisch das Erneuern (Rotate) des Originals —
// nachgebaut nach Wallet.tsx refreshOneBearer, ohne den Vault-Zweig (Senden spaltet nur Scheine,
// deren Geheimnis im Browser liegt).
//
// Hat der Empfänger schon eingelöst, ist das kein Fehler: der Schein verschwindet, der Verlauf sagt „gesendet“.
import {
  AmbiguousMutationError,
  fetchNoteInfo,
  NoteSpentError,
  NoteUnknownError,
  probeBurnedNote,
  requireNoteK1,
  rotateNote,
  serverOf,
  withNewK1
} from '../lnurlcash'
import {createSignal} from 'solid-js'

import type {Bearer} from '../storage'
import type {WalletContextType} from '../WalletContext'
import {vergiss} from './einloesen'
import {erneuereEmpfangen} from './umwandeln'

type Kontext = Pick<
  WalletContextType,
  'addBearer' | 'updateBearer' | 'removeBearer' | 'logActivity'
>

export type Ergebnis = 'zurueck' | 'schon-eingeloest'

// die Stelle meldet den Schein als gültig, lässt ihn aber nicht erneuern — er bleibt, nichts wird gelöscht
export class ErneuernAbgelehnt extends Error {
  constructor(host: string) {
    super(
      `${host} lässt diesen Schein gerade nicht erneuern — er bleibt bei dir und ist laut Stelle gültig.`
    )
  }
}

// zweck 'absichern': ein empfangener Schein, den das Einlösen nicht erneuern konnte — der Absender hat
// dann noch eine gültige Kopie; erst das Erneuern macht ihn zu unserem (Steve, 2026-10-15)
export const holeZurueck = async (
  schein: Bearer,
  ctx: Kontext,
  zweck: 'zurueckholen' | 'absichern' = 'zurueckholen'
): Promise<Ergebnis> => {
  const {addBearer, updateBearer, removeBearer, logActivity} = ctx
  const sats = Math.floor(schein.amount / 1000)
  // schon eingelöst: wertlos, also weg — wie bei der Einlöse-Wache, mit derselben Zeile im Verlauf
  const eingeloest = () => {
    logActivity(
      'spent',
      zweck === 'absichern'
        ? `Empfangener Schein über ${sats.toLocaleString('de-DE')} Sats war schon eingelöst — der Absender hat ihn wohl zurückgeholt (${serverOf(schein.url)}).`
        : `${sats.toLocaleString('de-DE')} Sats gesendet — vom Empfänger eingelöst (${serverOf(schein.url)}).`,
      schein.label
    )
    removeBearer(schein.id)
    vergiss(schein.id)
  }

  let info
  try {
    info = await fetchNoteInfo(schein.url)
  } catch (err) {
    if (err instanceof NoteSpentError || err instanceof NoteUnknownError) {
      eingeloest()
      return 'schon-eingeloest'
    }
    throw err
  }

  let url: string
  try {
    // absichern (Empfang): alte Hash-Scheine dabei umwandeln — wie beim Empfang selbst (umwandeln.ts)
    const rotiert =
      zweck === 'absichern'
        ? await erneuereEmpfangen(info.callback, requireNoteK1(schein.url))
        : await rotateNote(info.callback, requireNoteK1(schein.url))
    url = withNewK1(
      schein.url,
      rotiert.k1,
      info.maxWithdrawable,
      rotiert.signature
    )
  } catch (err) {
    if (err instanceof NoteSpentError) {
      // Erst noch einmal nachfragen: war er wirklich eben eingelöst, oder lehnt die Stelle nur das
      // Erneuern ab? lnurl.21mint.me meldete einen gültigen Schein bei der Nachfrage, verweigerte
      // aber das Erneuern mit „Invalid or already spent k1“ — und der Schein wurde hier gelöscht,
      // obwohl er noch galt (Gerhard, Pixel/iPad, 2026-10-15). Gelöscht wird nur auf Nachfrage-Beleg.
      try {
        await fetchNoteInfo(schein.url)
      } catch (nochmal) {
        if (
          nochmal instanceof NoteSpentError ||
          nochmal instanceof NoteUnknownError
        ) {
          eingeloest()
          return 'schon-eingeloest'
        }
        throw nochmal
      }
      throw new ErneuernAbgelehnt(serverOf(schein.url))
    }
    if (!(err instanceof AmbiguousMutationError)) throw err
    // wie im Original: Ist das Erneuern vielleicht doch angekommen, ist das frische Geheimnis
    // die einzige Kopie — nie raten, im Zweifel beide behalten
    const ausgang = await probeBurnedNote(schein.url)
    if (ausgang === 'gone') {
      url = withNewK1(schein.url, err.newSecrets[0], info.maxWithdrawable)
    } else {
      if (ausgang === 'unknown') {
        await addBearer({
          url: withNewK1(schein.url, err.newSecrets[0], info.maxWithdrawable),
          callback: info.callback,
          amount: info.maxWithdrawable,
          verified: false,
          mintPubkey: info.mintPubkey ?? schein.mintPubkey
        })
      }
      throw err
    }
  }

  await updateBearer(schein.id, {
    url,
    callback: info.callback,
    amount: info.maxWithdrawable,
    verified: true,
    mintPubkey: info.mintPubkey ?? schein.mintPubkey
  })
  vergiss(schein.id)
  logActivity(
    zweck === 'absichern' ? 'receive' : 'refresh',
    zweck === 'absichern'
      ? `Empfang von ${sats} Sats abgesichert (${serverOf(url)}) — der Absender hat keine gültige Kopie mehr.`
      : `Schein über ${sats} Sats zurückgeholt (${serverOf(url)}) — der gezeigte QR ist wertlos.`,
    schein.label
  )
  return 'zurueck'
}

// Zurückholen als Auftrag (Steve, 2026-10-16, Muster Postausgang): Wer offline „Zurückholen“ tippt,
// bekommt keinen Fehler — der Auftrag bleibt liegen (übersteht Sperren und Neustart) und die
// Prüfwache führt ihn aus, sobald die Stelle antwortet. Der QR wird sofort nicht mehr gezeigt.
// Ein Auftrag endet nur mit Beleg: zurückgeholt, schon eingelöst, oder die Stelle lehnt ab.
const AUFTRAEGE = 'fork_zurueckholen'
const liesAuftraege = (): string[] => {
  try {
    const l = JSON.parse(localStorage.getItem(AUFTRAEGE) ?? '[]')
    return Array.isArray(l) ? (l as string[]) : []
  } catch {
    return []
  }
}
const [zurueckzuholen, setzeAuftraege] = createSignal<string[]>(liesAuftraege())
export {zurueckzuholen}
const schreibeAuftraege = (l: string[]) => {
  setzeAuftraege(l)
  try {
    localStorage.setItem(AUFTRAEGE, JSON.stringify(l))
  } catch {
    // ohne Speicher bis zum Neuladen
  }
}
export const merkeZurueckholen = (id: string) => {
  if (!zurueckzuholen().includes(id))
    schreibeAuftraege([...zurueckzuholen(), id])
}
export const vergissZurueckholen = (id: string) =>
  schreibeAuftraege(zurueckzuholen().filter(x => x !== id))

// je Schein höchstens ein Versuch zugleich — Taste und Prüfwache dürfen sich nicht überholen
const laeuft = new Set<string>()

export type Auftrag = Ergebnis | 'gemerkt' | 'laeuft'

// Taste „Zurückholen“: Auftrag sofort merken (die Oberfläche zeigt ihn gleich), dann versuchen.
// Kommt keine Antwort, bleibt er liegen; lehnt die Stelle ab oder ist es unklar, endet er mit Fehler.
export const zurueckholenAuftrag = async (
  schein: Bearer,
  ctx: Kontext
): Promise<Auftrag> => {
  merkeZurueckholen(schein.id)
  if (laeuft.has(schein.id)) return 'laeuft'
  laeuft.add(schein.id)
  try {
    const e = await holeZurueck(schein, ctx)
    vergissZurueckholen(schein.id)
    return e
  } catch (err) {
    if (
      err instanceof ErneuernAbgelehnt ||
      err instanceof AmbiguousMutationError
    ) {
      vergissZurueckholen(schein.id)
      throw err
    }
    return 'gemerkt' // keine Antwort — die Prüfwache holt nach
  } finally {
    laeuft.delete(schein.id)
  }
}

export const zurueckholenLaeuft = (id: string) => laeuft.has(id)
