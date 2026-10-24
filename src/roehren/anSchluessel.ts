// „An einen Schlüssel übertragen“ ist ein Werkzeug für Entwickler (Steve, 2026-10-24): es steht nur im
// Scheinblatt, wenn es unter Für Entwickler eingeschaltet ist. Standard: aus.
import {createSignal} from 'solid-js'

const SCHLUESSEL = 'fork_an_schluessel'

const gelesen = (): boolean => {
  try {
    return localStorage.getItem(SCHLUESSEL) === '1'
  } catch {
    return false
  }
}

const [anSchluesselAn, setzeSignal] = createSignal(gelesen())
export {anSchluesselAn}

export const setAnSchluesselAn = (an: boolean): void => {
  try {
    localStorage.setItem(SCHLUESSEL, an ? '1' : '0')
  } catch {
    // ohne Speicher gilt es für diese Sitzung
  }
  setzeSignal(an)
}
