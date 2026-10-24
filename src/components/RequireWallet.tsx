import type {Component, JSX} from 'solid-js'
import {Show} from 'solid-js'
import {Navigate} from '@solidjs/router'

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
        // Fork: gesperrt deckt das Röhrenschloss jede Seite (components/Nav.tsx) — hier nichts Eigenes
        // mehr; die alte Karte „Deine Wallet ist gesperrt“ schien beim Entsperren durch (2026-10-24).
        // Ohne Wallet zur Begrüßung (neu / habe schon eine), nicht direkt zu neuen Wörtern.
        <Show when={state() !== 'locked'}>
          <Navigate href="/" />
        </Show>
      }
    >
      {props.children}
    </Show>
  )
}
export default RequireWallet
