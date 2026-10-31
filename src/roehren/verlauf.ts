// Verlauf lesen: das Original speichert je Eintrag nur einen Satz (storage.ts ActivityEvent), keinen
// Betrag — Richtung, kurzer Titel, Betrag und Ausgabestelle werden hier aus Art und Satz gewonnen.
import type {ActivityEvent, ActivityKind} from '../storage'

export type Richtung = 'in' | 'out' | 'neutral'

export const RICHTUNG: Record<ActivityKind, Richtung> = {
  mint: 'in',
  receive: 'in',
  recovered: 'in',
  melt: 'out',
  transfer: 'out',
  spent: 'out',
  split: 'neutral',
  combine: 'neutral',
  refresh: 'neutral',
  unspent: 'neutral',
  deleted: 'neutral'
}

export const titel = (e: ActivityEvent): string => {
  const m = e.message
  switch (e.kind) {
    case 'mint':
      return 'Aufgeladen'
    case 'receive':
      return 'Schein empfangen'
    case 'recovered':
      return 'Wiedergefunden'
    case 'melt':
      return 'Rechnung bezahlt'
    case 'transfer':
      return 'Übertragen'
    case 'spent':
      return /gesendet/.test(m) ? 'Schein gesendet' : 'Als ausgegeben markiert'
    case 'split':
      return /zusammengelegt/.test(m) ? 'Zusammengelegt und geteilt' : 'Geteilt'
    case 'combine':
      return 'Zusammengelegt'
    case 'refresh':
      if (/zurückgeholt/.test(m)) return 'Zurückgeholt'
      if (/^Neue Ausgabestelle/.test(m)) return 'Neue Ausgabestelle'
      if (/Ungeprüften Schein .* bestätigt/.test(m)) return 'Bestätigt'
      if (/kennt einen ungeprüften Schein/.test(m))
        return 'Unbekannt — zu prüfen'
      return 'Erneuert'
    case 'unspent':
      // Bezahl-Wache: die Zahlung scheiterte, der Schein ist zurück (bezahlwache.ts) — keine Markierung
      return m.startsWith('Nicht durchgegangen')
        ? 'Nicht durchgegangen'
        : 'Markierung aufgehoben'
    case 'deleted':
      return 'Gelöscht'
  }
}

// erster Betrag vor „Sats“/„sats“/„sat“ (nicht „msat“); Tausenderpunkte und Leerräume fallen weg
const BETRAG = /(\d[\d.,   ]*)\s*sats?\b/i
export const betragAus = (m: string): number | null => {
  const t = m.match(BETRAG)
  if (!t) return null
  const zahl = Number(t[1].replace(/[.,   ]/g, ''))
  return Number.isFinite(zahl) ? zahl : null
}
const HOST = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i
export const stelleAus = (m: string): string | null =>
  m.replace(/https?:\/\/\S+/g, '').match(HOST)?.[1] ?? null

// „Verify:“ (Original) und „Prüfen:“ (übersetzt) — der Link gehört in den aufgeklappten Teil
const PRUEFEN = / (?:Verify|Prüfen): (\S+?)\.$/
export const trennePruefLink = (
  m: string
): {text: string; url: string | null} => {
  const t = m.match(PRUEFEN)
  return t ? {text: m.slice(0, t.index), url: t[1]} : {text: m, url: null}
}
