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

// Der Filter nimmt jeden Farbwert mal v — auch den Hintergrund (Gerhard am Pixel: „hat sich auch der
// Hintergrund geändert?“). Darum wird dessen Bild (styles/background.scss) mit Farben durch v gezeichnet:
// mal v ergibt das genau den alten Hintergrund. Ändert sich background.scss, hier mitziehen.
const durch = (hex: string, v: number) => {
  const n = parseInt(hex.slice(1), 16)
  const k = (x: number) => Math.round(x / v)
  return `${k(n >> 16)}, ${k((n >> 8) & 255)}, ${k(n & 255)}`
}
const hintergrund = (v: number) => {
  const glut = durch('#ff9d3f', v)
  return [
    `radial-gradient(ellipse 70% 50% at 15% -10%, rgba(${glut}, 0.1), transparent 60%)`,
    `radial-gradient(ellipse 60% 45% at 100% 15%, rgba(${glut}, 0.07), transparent 60%)`,
    `radial-gradient(ellipse 80% 60% at 50% 115%, rgba(${glut}, 0.08), transparent 65%)`,
    `linear-gradient(160deg, rgb(${durch('#08090c', v)}) 0%, rgb(${durch('#0a0c10', v)}) 55%, rgb(${durch('#060708', v)}) 100%)`
  ].join(', ')
}

const anwenden = (v: Stufe) => {
  if (typeof document === 'undefined') return
  document.documentElement.style.filter = v === 1 ? '' : `brightness(${v})`
  document.body.style.backgroundImage = v === 1 ? '' : hintergrund(v)
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
