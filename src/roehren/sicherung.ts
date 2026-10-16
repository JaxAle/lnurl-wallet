// Erinnerung an die Sicherung (Steve, 2026-10-15/16): unter der großen Zahl eine Zeile, wenn Geld nur
// auf diesem Gerät liegt — „Sicherung ist 5 Tage alt · 4 Scheine seither › sichern“.
//
// Gezählt wird nur, was die zwölf Wörter NICHT wiederfinden (kein ck1-Schein oder noch ungeprüft —
// dieselbe Regel wie beim Entfernen der Wallet) und was die letzte Sicherung nicht in dieser Fassung
// enthält. Erneuern ändert das Geheimnis: ein erneuerter Schein steht in der alten Sicherung wertlos.
// Gemerkt wird je Schein nur ein kurzer Fingerabdruck der Adresse (32 bit, FNV-1a) — kein Geheimnis.
import {createSignal} from 'solid-js'

import {isCk1, noteK1} from '../lnurlcash'

const SCHLUESSEL = 'fork_sicherung'

type Stand = {zeit: number; scheine: Record<string, string>}

const lies = (): Stand | null => {
  try {
    const s = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null')
    return s && typeof s.zeit === 'number' && s.scheine ? (s as Stand) : null
  } catch {
    return null
  }
}

const [letzte, setLetzte] = createSignal<Stand | null>(lies())
export const letzteSicherung = () => letzte()?.zeit ?? null

export const fingerabdruck = (url: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

type Schein = {
  id: string
  url: string
  amount: number
  verified: boolean
  spent?: boolean
  updatedAt?: number
}

// nur in einer Sicherung zu retten — die Wörter finden ihn nicht
export const nurMitSicherung = (b: Schein) =>
  !b.spent && (!b.verified || !isCk1(noteK1(b.url) ?? ''))

export const merkeSicherung = (alle: Schein[], jetzt = Date.now()) => {
  const s: Stand = {
    zeit: jetzt,
    scheine: Object.fromEntries(
      alle.filter(b => !b.spent).map(b => [b.id, fingerabdruck(b.url)])
    )
  }
  setLetzte(s)
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(s))
  } catch {
    // ohne Speicher erinnert die Zeile eben weiter
  }
}

// Scheine, die nur eine Sicherung retten könnte und die die letzte nicht (so) enthält
export const ungesichert = <T extends Schein>(alle: T[]): T[] => {
  const s = letzte()
  return alle.filter(
    b => nurMitSicherung(b) && s?.scheine[b.id] !== fingerabdruck(b.url)
  )
}

// Wann die Zeile erscheint: nicht nach jedem Empfang sofort (das wäre Lärm), sondern wenn ein
// ungesicherter Schein älter als ein Tag ist, oder es drei oder mehr sind
export const erinnern = (offen: Schein[], jetzt = Date.now()) =>
  offen.length >= 3 ||
  offen.some(b => jetzt - (b.updatedAt ?? jetzt) > 24 * 60 * 60 * 1000)

export const alterText = (zeit: number | null, jetzt = Date.now()): string => {
  if (zeit === null) return 'Noch keine Sicherung'
  const tage = Math.floor((jetzt - zeit) / (24 * 60 * 60 * 1000))
  if (tage <= 0) return 'Sicherung von heute'
  if (tage === 1) return 'Sicherung ist 1 Tag alt'
  return `Sicherung ist ${tage} Tage alt`
}
