// Oben im Verlauf: Scheine, die aufgedeckt und noch nicht eingelöst sind (Prototyp: „ungeprüfte und
// unterwegs befindliche Scheine stehen oben im Verlauf“). Bewusst Zeilen statt Karten: eine Karte
// trägt "Rotate", und Rotieren machte dem Empfänger den übergebenen Schein ungültig.
import type {Component} from 'solid-js'
import {createMemo, For, Show} from 'solid-js'

import {useWallet} from '../WalletContext'
import {unterwegs} from './einloesen'

const host = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const UnterwegsListe: Component = () => {
  const {bearers} = useWallet()
  const liste = createMemo(() => {
    const ids = new Set(unterwegs())
    return bearers().filter(b => ids.has(b.id) && !b.spent)
  })
  return (
    <Show when={liste().length > 0}>
      <section class="rz-unterwegs">
        <h3>Unterwegs</h3>
        <p class="rz-hinweis">
          Übergeben, aber noch nicht eingelöst — die Wallet fragt nach, solange sie offen ist.
        </p>
        <For each={liste()}>
          {bearer => (
            <div class="rz-zeile">
              <span class="rz-lampe-klein" />
              <span>{Math.floor(bearer.amount / 1000).toLocaleString('de-AT')} Sats</span>
              <span class="rz-matt">{host(bearer.url)}</span>
            </div>
          )}
        </For>
      </section>
    </Show>
  )
}

export default UnterwegsListe
