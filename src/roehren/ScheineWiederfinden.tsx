// Scheine wiederfinden aus den Einstellungen (Steve, 2026-10-16): bei allen Stellen auf einmal, neben
// „Sicherung erstellen“ und „Sicherung einspielen“ — dort sucht man, wenn Geld fehlt. Dieselbe Seite wie
// nach dem Wiederherstellen (Wiederfinden.tsx). Braucht die entsperrte Wallet: gefundene Scheine werden
// verschlüsselt abgelegt.
import type {Component} from 'solid-js'
import {Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {useWallet} from '../WalletContext'
import Wiederfinden from './Wiederfinden'
import './roehren.css'

const ScheineWiederfinden: Component = () => {
  const {state} = useWallet()
  const navigate = useNavigate()
  return (
    <div class="page rz-einstellungen">
      <div class="rz-seitenkopf">
        <A href="/settings" class="rz-zurueck" aria-label="Zurück">
          ‹
        </A>
        <h2>Scheine wiederfinden</h2>
      </div>
      <Show
        when={state() === 'unlocked'}
        fallback={
          <p class="rz-hinweis">
            Entsperre zuerst die Wallet — gefundene Scheine werden verschlüsselt
            abgelegt.
          </p>
        }
      >
        <Wiederfinden onFertig={() => navigate('/wallet')} />
      </Show>
    </div>
  )
}

export default ScheineWiederfinden
