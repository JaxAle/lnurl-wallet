// Welche Ausgabestelle beim Aufladen genommen wird (Prototyp: „Standard“ in der Liste der Stellen).
// Nur eine Vorliebe dieses Geräts, kein Geheimnis — daher schlicht in localStorage.
import {createSignal} from 'solid-js'

import {serverOf} from '../lnurlcash'
import type {TrustedMint} from '../trustedMints'

const SCHLUESSEL = 'fork_standard_stelle'

const lies = (): string | null => {
  try {
    return localStorage.getItem(SCHLUESSEL)
  } catch {
    return null
  }
}

const [standard, setStandardSignal] = createSignal<string | null>(lies())
export {standard}

export const setStandard = (server: string): void => {
  const host = serverOf(server)
  try {
    localStorage.setItem(SCHLUESSEL, host)
  } catch {
    // ohne Speicher gilt die Wahl eben nur bis zum Neuladen
  }
  setStandardSignal(host)
}

// die gewählte Stelle, sonst die erste vertraute
export const standardStelle = (
  stellen: TrustedMint[]
): TrustedMint | undefined =>
  stellen.find(m => serverOf(m.server) === standard()) ?? stellen[0]
