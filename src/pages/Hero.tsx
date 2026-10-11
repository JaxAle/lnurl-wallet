import type {Component} from 'solid-js'
import {Show} from 'solid-js'
import {A} from '@solidjs/router'
import {
  IoCashSharp,
  IoLockClosedSharp,
  IoServerSharp,
  IoGitBranchSharp,
  IoSaveSharp,
  IoHardwareChipSharp
} from 'solid-icons/io'

import {useWallet} from '../WalletContext'

// The home page - always the marketing/landing view, regardless of wallet
// state. The actual wallet (bearer list, unlock form) lives at /wallet;
// this only ever links there.
const Hero: Component = () => {
  const {state} = useWallet()

  return (
    <div id="hero" class="page">
      <section class="hero-intro">
        <h1>Deine LNURLcash-Wallet</h1>
        <p class="hero-subtitle">
          Die Wallet ist eine Webseite ohne eigenen Server. Sie verwahrt LNURLcash-Scheine – LNURL-withdraw-Links, deren k1 das Geld ist – von beliebig vielen Ausgabestellen, verschlüsselt mit einem Schlüssel aus deinen zwölf Wörtern und gespeichert nur in diesem Browser.
        </p>
        <div class="hero-actions">
          <Show
            when={state() !== 'none'}
            fallback={
              <A href="/setup" class="hero-btn hero-btn-primary">
                Wallet anlegen
              </A>
            }
          >
            <A href="/wallet" class="hero-btn hero-btn-primary">
              Zu meiner Wallet
            </A>
          </Show>
        </div>
      </section>
      <section class="hero-features">
        <div class="hero-feature">
          <IoCashSharp />
          <h3>Inhaberscheine (LUD-25)</h3>
          <p>
            Ein Schein ist ein gewöhnlicher LNURL-withdraw-Link, dessen k1 das Geld ist – wer ihn hat, verfügt über die Sats. Jede Wallet kann ihn einlösen; diese kann noch mehr.
          </p>
        </div>
        <div class="hero-feature">
          <IoLockClosedSharp />
          <h3>Verschlüsselt gespeichert</h3>
          <p>
            Jeder Schein wird mit einem Schlüssel aus deinen zwölf Wörtern (AES-GCM) verschlüsselt, bevor er gespeichert wird – und dieser Schlüssel kann zusätzlich mit einem Passwort geschützt werden.
          </p>
        </div>
        <div class="hero-feature">
          <IoServerSharp />
          <h3>Viele Ausgabestellen, eine Wallet</h3>
          <p>
            Jeder Schein trägt seine Ausgabestelle in sich – so liegen Scheine vieler unabhängiger Ausgabestellen nebeneinander in einer Wallet.
          </p>
        </div>
        <div class="hero-feature">
          <IoGitBranchSharp />
          <h3>Bezahlen, teilen, zusammenlegen</h3>
          <p>
            Mit einem Schein jede Lightning-Rechnung bezahlen, ihn in Wechselgeld teilen oder Scheine derselben Ausgabestelle zusammenlegen.
          </p>
        </div>
        <div class="hero-feature">
          <IoSaveSharp />
          <h3>Sichern &amp; wiederherstellen</h3>
          <p>
            Alle Scheine als eine Datei herunterladen – verschlüsselt, genau wie gespeichert. Mit deinen zwölf Wörtern überall wiederherstellen.
          </p>
        </div>
        <div class="hero-feature">
          <IoHardwareChipSharp />
          <h3>Hardware-Tresor (optional)</h3>
          <p>
            Ein LNURLvault-Gerät über USB oder Bluetooth koppeln: es erzeugt und verwahrt die Geheimnisse deiner Scheine – die Wallet hält nur ein leeres Abbild, nie das Geld selbst.
          </p>
        </div>
      </section>
    </div>
  )
}
export default Hero
