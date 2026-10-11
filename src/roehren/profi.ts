// Profi-Modus (Prototyp: Einstellungen › „Einzelne Scheine sehen, wechseln, zusammenlegen, umziehen“).
// Aus: die Wallet zeigt nur Guthaben, Senden, Empfangen, Verlauf. An: zusätzlicher Reiter „Scheine“
// mit allen Werkzeugen des Originals. Gemerkt je Gerät.
import {createSignal} from 'solid-js'

const SCHLUESSEL = 'fork_profi'

const lies = (): boolean => {
  try {
    return localStorage.getItem(SCHLUESSEL) === '1'
  } catch {
    return false
  }
}

const [profi, setProfiSignal] = createSignal(lies())
export {profi}

export const setProfi = (an: boolean): void => {
  setProfiSignal(an)
  try {
    localStorage.setItem(SCHLUESSEL, an ? '1' : '0')
  } catch {
    // ohne Speicher gilt die Wahl bis zum Neuladen
  }
}
