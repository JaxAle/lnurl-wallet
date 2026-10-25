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
// Hintergrund je Haut — Röhren: styles/background.scss; Fallblatt: fallblatt.css (body)
const HINTERGRUND = {
  roehren: {
    glut: '#ff9d3f',
    flecken: [
      ['ellipse 70% 50% at 15% -10%', 0.1, 60],
      ['ellipse 60% 45% at 100% 15%', 0.07, 60],
      ['ellipse 80% 60% at 50% 115%', 0.08, 65]
    ],
    grund: ['#08090c', '#0a0c10', '#060708']
  },
  fallblatt: {
    glut: '#f6c560',
    flecken: [['ellipse 70% 50% at 15% -10%', 0.06, 60]],
    grund: ['#1d1f1b', '#181a16', '#121310']
  }
} as const
const hintergrund = (v: number) => {
  const h =
    typeof document !== 'undefined' &&
    document.documentElement.dataset.haut === 'fallblatt'
      ? HINTERGRUND.fallblatt
      : HINTERGRUND.roehren
  const glut = durch(h.glut, v)
  return [
    ...h.flecken.map(
      ([form, a, bis]) =>
        `radial-gradient(${form}, rgba(${glut}, ${a}), transparent ${bis}%)`
    ),
    `linear-gradient(160deg, rgb(${durch(h.grund[0], v)}) 0%, rgb(${durch(h.grund[1], v)}) 55%, rgb(${durch(h.grund[2], v)}) 100%)`
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

// nach einem Wechsel der Haut den Hintergrund neu zeichnen
export const hintergrundNeu = (): void => anwenden(leuchtkraft())
