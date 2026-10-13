// Rückfrage vor etwas Endgültigem — immer als Blatt über allem, nie unten in der Seite aufgeklappt:
// am Pixel ging „Ausgabestelle entfernen“ außerhalb des Bildschirms auf und blieb unbemerkt
// (Gerhard/Steve, 2026-10-12). Ein Muster für Entfernen, Löschen, Wallet vergessen.
import type {Component, JSX} from 'solid-js'

import Dialog from '../components/Dialog'
import './roehren.css'

const Rueckfrage: Component<{
  titel: string
  children: JSX.Element
  ja: string
  onJa: () => void
  onNein: () => void
  // Zweitknopf statt „Abbrechen“, z. B. „Erst sichern“
  nein?: string
}> = props => (
  <Dialog onClose={() => props.onNein()}>
    <div class="rz-blatt rz-rueckfrage-blatt">
      <h3>{props.titel}</h3>
      <div class="rz-rueckfrage-text">{props.children}</div>
      <div class="rz-duo">
        <button
          type="button"
          class="rz-knopf-gefahr"
          onClick={() => props.onJa()}
        >
          {props.ja}
        </button>
        <button
          type="button"
          class="rz-knopf rz-knopf-flach"
          onClick={() => props.onNein()}
        >
          {props.nein ?? 'Abbrechen'}
        </button>
      </div>
    </div>
  </Dialog>
)

export default Rueckfrage
