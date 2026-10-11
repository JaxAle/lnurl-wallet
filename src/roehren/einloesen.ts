// Einlösen erkennen (Fork) — ein übergebener Schein wird als ausgegeben markiert, sobald die
// Ausgabestelle ihn als verbraucht meldet. Im Original ist "Mark done" Handarbeit.
//
// Gefragt wird nur mit der informativen Abfrage ohne k1-Wechsel (lib/request.ts:
// probeBurnedNote → fetchNoteInfo), nie mit "Refresh": Refresh rotiert und würde dem
// Empfänger einen noch nicht eingelösten Schein ungültig machen (VORBILD.md).
// Nur solange die App offen und sichtbar ist — kein Hintergrunddienst.
import {probeBurnedNote} from '../lib/request'

const SCHLUESSEL = 'fork_unterwegs'
// wie lange ein aufgedeckter Schein beobachtet wird, danach gilt er als nicht übergeben
const HOECHSTENS_MS = 7 * 24 * 60 * 60 * 1000

type Unterwegs = Record<string, number> // Schein-id → seit (ms)

const lies = (): Unterwegs => {
  try {
    const roh = localStorage.getItem(SCHLUESSEL)
    const wert = roh ? JSON.parse(roh) : {}
    return wert && typeof wert === 'object' ? wert : {}
  } catch {
    return {}
  }
}

const schreib = (u: Unterwegs): void => {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(u))
  } catch {
    // ohne Speicher wird eben nicht beobachtet — die Wallet funktioniert trotzdem
  }
}

// beim Aufdecken zur Übergabe (BearerCard startUnveil)
export const merkeUnterwegs = (id: string, jetzt = Date.now()): void => {
  const u = lies()
  if (!u[id]) {
    u[id] = jetzt
    schreib(u)
  }
}

export const unterwegsIds = (): string[] => Object.keys(lies())

export const vergiss = (id: string): void => {
  const u = lies()
  if (id in u) {
    delete u[id]
    schreib(u)
  }
}

type Schein = {id: string; url: string; spent?: boolean; deviceId?: string}

// Eine Runde: jeden beobachteten, noch nicht ausgegebenen Schein einmal nachfragen.
// Liefert die ids, die die Ausgabestelle als verbraucht gemeldet hat.
export const pruefeRunde = async (
  scheine: Schein[],
  markiere: (id: string) => Promise<void>,
  frage: (url: string) => Promise<'live' | 'gone' | 'unknown'> = probeBurnedNote,
  jetzt = Date.now()
): Promise<string[]> => {
  const u = lies()
  const eingeloest: string[] = []
  for (const [id, seit] of Object.entries(u)) {
    const schein = scheine.find(s => s.id === id)
    // weg, schon ausgegeben, zu alt, oder Geheimnis liegt auf einem Gerät (keine k1 in der url)
    if (!schein || schein.spent || schein.deviceId || jetzt - seit > HOECHSTENS_MS) {
      vergiss(id)
      continue
    }
    const antwort = await frage(schein.url)
    if (antwort === 'gone') {
      await markiere(id)
      vergiss(id)
      eingeloest.push(id)
    }
    // 'live': noch nicht eingelöst · 'unknown': keine Auskunft — beides weiter beobachten
  }
  return eingeloest
}
