// Begrüßung wie im Prototyp (screens['onb-welcome']): ein ruhiger Bildschirm statt der technischen
// Startseite des Originals („LNURL-withdraw-Links, deren k1 das Geld ist …“) — seit die Wallet
// öffentlich ist, sehen Fremde ihn zuerst (Steve, 2026-10-13). Die Seite des Originals bleibt unter
// /ueber („Wie die Wallet funktioniert“, Einstellungen › Erweitert). Mit Wallet geht es gleich weiter.
import type {Component} from 'solid-js'
import {Show} from 'solid-js'
import {A, Navigate} from '@solidjs/router'

import {useWallet} from '../WalletContext'
import './roehren.css'

const Willkommen: Component = () => {
  const {state} = useWallet()
  return (
    <Show when={state() === 'none'} fallback={<Navigate href="/wallet" />}>
      <div class="page rz-willkommen">
        <div class="rz-willkommen-text">
          <span class="rz-eyebrow">Servus</span>
          <h2>Bargeld fürs Handy.</h2>
          <p>
            Deine Scheine liegen nur auf diesem Gerät, verschlüsselt. Kein
            Konto, keine Anmeldung. Wer einen Schein hat, dem gehört er, wie bei
            echtem Geld.
          </p>
        </div>
        <div class="rz-willkommen-knoepfe">
          <A href="/setup" class="rz-knopf an rz-weiter rz-link-knopf">
            <span class="lbl">Neue Wallet anlegen</span>
          </A>
          <A href="/setup?tab=restore" class="rz-leise rz-block rz-mitte">
            Ich habe schon eine
          </A>
        </div>
      </div>
    </Show>
  )
}

export default Willkommen
