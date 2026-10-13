// Vorgänge „in Klärung“ (Steve, 2026-10-13). Bekommt die Wallet beim Teilen oder Zusammenlegen keine
// eindeutige Antwort, behält das Original die Eingangsscheine und legt die möglichen Ergebnisse ungeprüft
// daneben — merkt sich aber nicht, was zusammengehört. Am Pixel ließen sich so dieselben zwei 52er ein
// zweites Mal zusammenlegen, während das erste Zusammenlegen noch ungeklärt war.
//
// Hier wird das im Moment der unklaren Antwort festgehalten: welche Scheine hineingingen, welche
// möglichen Ergebnisse entstanden. Die Prüfwache löst den Vorgang dann als Ganzes auf — stattgefunden
// (Ergebnisse bestätigt, Eingänge weg) oder nicht (Ergebnisse weg, Eingänge wieder frei). Solange er
// offen ist, sind alle beteiligten Scheine gebunden: nicht auswählbar, nicht sendbar.
//
// Nur eine Vorliebe dieses Geräts, keine Geheimnisse: Ids und Beträge, kein Schein selbst.
import {createSignal} from 'solid-js'

import {fetchPayRequest, resolveMintInput, serverOf} from '../lnurlcash'
import type {Bearer} from '../storage'
import {getTrustedMintAddress, trustedMints} from '../trustedMints'

export type Vorgang = {
  id: string
  art: 'teilen' | 'zusammenlegen'
  host: string
  eingang: string[]
  eingangSats: number[]
  ergebnis: string[]
  ergebnisSats: number[]
  seit: number
  // wie oft die Stelle beim Klären nicht antwortete — ab 2: „antwortet gerade nicht“
  ohneAntwort: number
}

const SCHLUESSEL = 'fork_klaerung'
const lies = (): Vorgang[] => {
  try {
    return JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]') as Vorgang[]
  } catch {
    return []
  }
}
const [vorgaenge, setVorgaengeSignal] = createSignal<Vorgang[]>(lies())
export {vorgaenge}

const schreibe = (v: Vorgang[]) => {
  setVorgaengeSignal(v)
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(v))
  } catch {
    // ohne Speicher gilt es bis zum Neuladen
  }
}

// f gibt den geänderten Vorgang zurück, oder null = erledigt
export const aendere = (id: string, f: (v: Vorgang) => Vorgang | null) =>
  schreibe(
    vorgaenge().flatMap(v => {
      if (v.id !== id) return [v]
      const neu = f(v)
      return neu ? [neu] : []
    })
  )

// alle Scheine, die an einem offenen Vorgang hängen
export const gebunden = (): Set<string> => new Set(vorgaenge().flatMap(v => [...v.eingang, ...v.ergebnis]))

const sats = (b: Bearer) => Math.floor(b.amount / 1000)

// Vorgang ausführen und — falls er unklar endet — festhalten. `alle` liefert den aktuellen Stand
// der Wallet; neu entstandene ungeprüfte Scheine sind die möglichen Ergebnisse.
export const beobachte = async (
  art: Vorgang['art'],
  eingang: Bearer[],
  alle: () => Bearer[],
  tu: () => Promise<unknown>
): Promise<void> => {
  const vorher = new Set(alle().map(b => b.id))
  try {
    await tu()
  } finally {
    const neu = alle().filter(b => !vorher.has(b.id) && !b.verified && !b.spent)
    const noch = eingang.filter(e => alle().some(b => b.id === e.id && !b.spent))
    if (neu.length > 0 && noch.length > 0) {
      schreibe([
        ...vorgaenge(),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          art,
          host: serverOf(noch[0].url),
          eingang: noch.map(b => b.id),
          eingangSats: noch.map(sats),
          ergebnis: neu.map(b => b.id),
          ergebnisSats: neu.map(sats),
          seit: Date.now(),
          ohneAntwort: 0
        }
      ])
    }
  }
}

// Ist die Stelle aus diesem Netz erreichbar? Ein GET auf ihre Adresse, höchstens 6 s. Vor jedem
// Teilen/Zusammenlegen — im Firmen-WLAN (Blueshield) kam die Wallet nicht durch, und der Vorgang
// blieb unklar liegen (Gerhard, 2026-10-13). Nichts anfangen, was nicht fertig werden kann.
export const erreichbar = async (host: string): Promise<boolean> => {
  const t = trustedMints().find(m => serverOf(m.server) === host)
  const url = resolveMintInput((t && getTrustedMintAddress(t.server)) || `mint@${host}`)
  if (!url) return true // nichts zu fragen — nicht blockieren
  try {
    await Promise.race([
      fetchPayRequest(url),
      new Promise((_, nein) => setTimeout(() => nein(new Error('Zeit')), 6000))
    ])
    return true
  } catch {
    return false
  }
}

export const nichtErreichbar = (host: string) =>
  `${host} ist aus diesem Netz nicht erreichbar. Versuch es über Mobilfunk oder ein anderes WLAN — angefangen wurde nichts.`
