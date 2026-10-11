// Senden und Empfangen als Röhrenknöpfe — aus dem abgenommenen Prototyp (.big-action.tubes).
// Senden ist eine eingeschaltete Röhre, Empfangen eine ausgeschaltete; sie glüht erst unter
// dem Daumen auf. Beschriftung im Glühdraht-Schnitt (Gerhards Wunsch, 2026-10-07).
import type {Component} from 'solid-js'

import '@fontsource/jost/300.css'
import './roehren.css'

const Pfeil: Component<{d: string}> = props => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={props.d} />
  </svg>
)

// leer: bei 0 Sats glüht Empfangen, Senden ist aus — man kann nur das eine tun (Steve)
const Knoepfe: Component<{onSenden: () => void; onEmpfangen: () => void; leer?: boolean}> = props => (
  <div class="rz-duo">
    <button
      type="button"
      class="rz-knopf"
      classList={{an: !!props.leer}}
      onClick={() => props.onEmpfangen()}
    >
      <Pfeil d="M12 4v15M5 12l7 7 7-7" />
      <span class="lbl">Empfangen</span>
    </button>
    <button
      type="button"
      class="rz-knopf"
      classList={{an: !props.leer}}
      onClick={() => props.onSenden()}
    >
      <Pfeil d="M12 20V5M5 12l7-7 7 7" />
      <span class="lbl">Senden</span>
    </button>
  </div>
)

export default Knoepfe
