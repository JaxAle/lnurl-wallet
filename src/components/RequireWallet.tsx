import type {Component, JSX} from 'solid-js'
import {Show} from 'solid-js'
import {A, Navigate} from '@solidjs/router'

import {useWallet} from '../WalletContext'

// Gate for pages that need an unlocked wallet (mint/scan/paste/backup):
// without one there is no AES key to encrypt incoming bearers with, so
// point at setup / the unlock form on the wallet page instead
const RequireWallet: Component<{children: JSX.Element}> = props => {
  const {state} = useWallet()
  return (
    <Show
      when={state() === 'unlocked'}
      fallback={
        <div class="page">
          <div class="setup-card">
            <Show
              when={state() === 'locked'}
              fallback={
                // Fork: ohne Wallet zur Begrüßung (neu / habe schon eine), nicht direkt zu neuen Wörtern
                <Navigate href="/" />
              }
            >
              <p>Deine Wallet ist gesperrt.</p>
              <A href="/wallet" class="hero-btn hero-btn-primary">
                Entsperren
              </A>
            </Show>
          </div>
        </div>
      }
    >
      {props.children}
    </Show>
  )
}
export default RequireWallet
