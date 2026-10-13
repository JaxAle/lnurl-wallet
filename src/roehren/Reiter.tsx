// Reiterleiste unten: Wallet · Verlauf · Scheine · Einstellungen (Prototyp ohne Scheine; s. unten).
// Der Daumen erreicht sie; das Menü oben links bleibt nur für Seltenes (Doku, Erweiterungen).
// Das Lämpchen am Verlauf glimmt, solange ein Schein unterwegs ist. Hier läuft auch die
// Einlöse-Wache, damit sie auf jeder Seite nachfragt, nicht nur auf der Startseite.
import type {Component} from 'solid-js'
import {createMemo, For, Show} from 'solid-js'
import {A, useLocation} from '@solidjs/router'

import {useWallet} from '../WalletContext'
import EinloeseWache from './EinloeseWache'
import Pruefwache from './Pruefwache'
import {unterwegs} from './einloesen'
import './roehren.css'

// Symbole wörtlich aus dem Prototyp (Konstante I: wallet, clock, notes, gear) — feste Zeichenketten
const SYMBOLE: Record<string, string> = {
  wallet:
    '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><rect x="3" y="8" width="18" height="12" rx="2.5"/><circle cx="16.5" cy="14" r="1.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  notes:
    '<rect x="2.5" y="6" width="16" height="11" rx="2"/><path d="M6 3.5h13.5a2 2 0 0 1 2 2V14"/><circle cx="10.5" cy="11.5" r="2.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
}

const Symbol: Component<{name: string}> = props => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    innerHTML={SYMBOLE[props.name]}
  />
)

const Reiter: Component = () => {
  const {state, bearers} = useWallet()
  const ort = useLocation()
  const lampe = createMemo(() => {
    const ids = new Set(unterwegs())
    return bearers().some(b => ids.has(b.id) && !b.spent)
  })
  const reiter = () => {
    const r: [string, string, string][] = [
      ['/wallet', 'Wallet', 'wallet'],
      ['/activity', 'Verlauf', 'clock']
    ]
    // immer sichtbar: Teilen und Zusammenlegen sind der Kern von LNURLcash (Gerhard, 2026-10-11 —
    // Abweichung vom Prototyp, dort nur im Profi-Modus)
    r.push(['/scheine', 'Scheine', 'notes'])
    r.push(['/settings', 'Einstellungen', 'gear'])
    return r
  }
  return (
    <Show when={state() === 'unlocked'}>
      <EinloeseWache />
      <Pruefwache />
      {/* beim Eintippen eines Betrags keine Leiste — wie im Prototyp (keypadScreen: tabs: false) */}
      <Show
        when={
          !['/senden', '/empfangen', '/aufladen'].some(p =>
            ort.pathname.startsWith(p)
          )
        }
      >
        {/* div statt nav: style.scss hängt jedem nav "position: fixed; top: 0" an — zusammen mit
      bottom: 0 streckte sich die Leiste über den ganzen Bildschirm und verdeckte alles (Pixel) */}
        <div class="rz-reiter" role="navigation" aria-label="Hauptnavigation">
          <For each={reiter()}>
            {([pfad, name, symbol]) => (
              <A
                href={pfad}
                class="rz-tab"
                aria-current={
                  ort.pathname === pfad || ort.pathname.startsWith(pfad + '/')
                    ? 'page'
                    : undefined
                }
              >
                <Show when={pfad === '/activity' && lampe()}>
                  <span class="rz-lampe" />
                </Show>
                <Symbol name={symbol} />
                <span>{name}</span>
              </A>
            )}
          </For>
        </div>
      </Show>
    </Show>
  )
}

export default Reiter
