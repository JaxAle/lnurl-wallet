// Was eine Rechnung über sich sagt (Bezahlen, Steve 2026-10-24): Betrag und Zweck („d“-Feld nach BOLT-11),
// und bei einer Lightning-Adresse der Text aus den Metadaten (LUD-06 text/plain) — für die Zeilen „Zweck“
// und „An“ vor dem Bezahlen. Nur lesen, nichts prüfen; die Prüfung macht das Original beim Bezahlen.
import {bech32} from '@scure/base'

const TAG_BESCHREIBUNG = 13 // 'd' im bech32-Zeichensatz

export const rechnungsZweck = (pr: string): string | null => {
  try {
    const w = bech32.decode(
      pr.trim().toLowerCase() as `${string}1${string}`,
      4096
    ).words
    const ende = w.length - 104
    let pos = 7
    while (pos + 3 <= ende) {
      const tag = w[pos]
      const len = w[pos + 1]! * 32 + w[pos + 2]!
      const start = pos + 3
      if (start + len > ende) break
      if (tag === TAG_BESCHREIBUNG) {
        const bytes = bech32.fromWordsUnsafe(w.slice(start, start + len))
        if (!bytes) return null
        const text = new TextDecoder().decode(new Uint8Array(bytes)).trim()
        return text || null
      }
      pos = start + len
    }
    return null
  } catch {
    return null
  }
}

// LUD-06 metadata: [["text/plain","…"], …]
export const adressText = (metadata: string): string | null => {
  try {
    const m = JSON.parse(metadata) as [string, string][]
    return m.find(([k]) => k === 'text/plain')?.[1]?.trim() || null
  } catch {
    return null
  }
}

// „lightning:lnbc…“ und Leerzeichen entfernen; Groß/klein bleibt (bech32 ist ohnehin einheitlich)
export const saeubere = (t: string): string =>
  t
    .trim()
    .replace(/^lightning:/i, '')
    .replace(/\s+/g, '')

// Übergabe an die Bezahlen-Seite (Startseite, Empfangen) — nicht über die Adresszeile
import {createSignal} from 'solid-js'
const [zuBezahlen, setZuBezahlen] = createSignal<string | null>(null)
export {zuBezahlen, setZuBezahlen}
