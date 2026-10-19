// Neue Fassung bereit — statt eines schwebenden Kästchens überall (über dem Röhrenschloss kaum zu
// lesen, Gerhard am Pixel 2026-10-19) eine Zeile oben auf der Startseite der geöffneten Wallet.
// Neu geladen wird nur auf Tipp: mitten in einem Vorgang soll nichts die Seite wegziehen.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'

import './roehren.css'

const [bereit, setBereit] = createSignal(false)
let neuLaden: (() => void) | null = null

// aus index.tsx (registerSW › onNeedRefresh)
export const meldeNeueFassung = (laden: () => void) => {
  neuLaden = laden
  setBereit(true)
}

const NeueFassung: Component = () => (
  <Show when={bereit()}>
    <button
      type="button"
      class="rz-neue-fassung"
      onClick={() => {
        setBereit(false)
        neuLaden?.()
      }}
    >
      <span class="rz-lampe-klein" />
      <span>Eine neue Fassung ist da</span>
      <span class="rz-neue-fassung-tun">Neu laden ›</span>
    </button>
  </Show>
)

export default NeueFassung
