// Leuchtkraft der ganzen Oberfläche (Gerhard, 2026-10-25): Schrift, Knöpfe, Linien, Lämpchen und Röhren
// zusammen heller. Ein Helligkeitsfilter auf dem Wurzelelement — nur dort schafft ein Filter keinen neuen
// Bezugsrahmen für feste Elemente (Blätter, Meldungen, Kopf bleiben, wo sie sind). Schwarz bleibt schwarz.
import {createSignal} from 'solid-js'

const SCHLUESSEL = 'fork_leuchtkraft'
export const STUFEN = [1, 1.2, 1.4] as const
export type Stufe = (typeof STUFEN)[number]
export const STUFE_TEXT: Record<Stufe, string> = {
  1: 'Normal',
  1.2: 'Heller (+20 %)',
  1.4: 'Am hellsten (+40 %)'
}

const gelesen = (): Stufe => {
  try {
    const v = Number(localStorage.getItem(SCHLUESSEL))
    return (STUFEN as readonly number[]).includes(v) ? (v as Stufe) : 1
  } catch {
    return 1
  }
}

const [leuchtkraft, setzeSignal] = createSignal<Stufe>(gelesen())
export {leuchtkraft}

const anwenden = (v: Stufe) => {
  if (typeof document === 'undefined') return
  document.documentElement.style.filter = v === 1 ? '' : `brightness(${v})`
}
anwenden(leuchtkraft())

export const setLeuchtkraft = (v: Stufe): void => {
  try {
    localStorage.setItem(SCHLUESSEL, String(v))
  } catch {
    // ohne Speicher gilt es für diese Sitzung
  }
  setzeSignal(v)
  anwenden(v)
}
