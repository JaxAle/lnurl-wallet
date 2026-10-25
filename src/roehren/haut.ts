// Haut der Wallet (Fallblatt-Idee, Gerhard 2026-10-25): „Röhren“ (bisher) oder „Fallblatt“. Dieselben
// Bausteine, nur ein anderes Bild — gesetzt als data-haut am Wurzelelement, damit es schon auf dem Schloss
// gilt. Alle Fallblatt-Regeln stehen in fallblatt.css unter html[data-haut='fallblatt']; das Röhren-Bild
// bleibt dadurch unberührt.
import {createSignal} from 'solid-js'
import './fallblatt.css'

const SCHLUESSEL = 'fork_haut'
export const HAEUTE = ['roehren', 'fallblatt'] as const
export type Haut = (typeof HAEUTE)[number]
export const HAUT_TEXT: Record<Haut, string> = {
  roehren: 'Röhren',
  fallblatt: 'Fallblatt'
}

const gelesen = (): Haut => {
  try {
    const v = localStorage.getItem(SCHLUESSEL)
    return (HAEUTE as readonly string[]).includes(v ?? '')
      ? (v as Haut)
      : 'roehren'
  } catch {
    return 'roehren'
  }
}

const [haut, setzeSignal] = createSignal<Haut>(gelesen())
export {haut}

const anwenden = (h: Haut) => {
  if (typeof document === 'undefined') return
  if (h === 'roehren') delete document.documentElement.dataset.haut
  else document.documentElement.dataset.haut = h
}
anwenden(haut())

export const setHaut = (h: Haut): void => {
  try {
    localStorage.setItem(SCHLUESSEL, h)
  } catch {
    // ohne Speicher gilt es für diese Sitzung
  }
  setzeSignal(h)
  anwenden(h)
}
