// Oben im Verlauf: Scheine, die aufgedeckt und noch nicht eingelöst sind (Prototyp: „ungeprüfte und
// unterwegs befindliche Scheine stehen oben im Verlauf“). Bewusst Zeilen statt Karten: eine Karte
// trägt "Rotate" ohne Rückfrage; hier heißt dasselbe ausdrücklich „zurückholen“.
import type {Component} from 'solid-js'
import {createMemo, createSignal, For, Show} from 'solid-js'

import {notify, NotifyKind} from '../helpers'
import {useWallet} from '../WalletContext'
import {zurueckholenAuftrag, zurueckzuholen} from './zurueckholen'
import {istZahlung} from './bezahlwache'
import {unterwegs} from './einloesen'

const host = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const UnterwegsListe: Component = () => {
  const {bearers, addBearer, updateBearer, removeBearer, logActivity} =
    useWallet()
  const [holt, setHolt] = createSignal<string | null>(null)
  const zurueckholen = async (id: string) => {
    const b = bearers().find(x => x.id === id)
    if (!b) return
    setHolt(id)
    try {
      const e = await zurueckholenAuftrag(b, {
        addBearer,
        updateBearer,
        removeBearer,
        logActivity
      })
      // zurückgeholt: das Zählwerk zählt hinauf; ohne Netz zeigt die Zeile den Auftrag (Steve)
      if (e === 'schon-eingeloest') notify('Schon eingelöst.')
    } catch (err) {
      notify(
        `Zurückholen geht gerade nicht: ${(err as Error).message}`,
        NotifyKind.ERROR
      )
    } finally {
      setHolt(null)
    }
  }
  const liste = createMemo(() => {
    const ids = new Set(unterwegs())
    return bearers().filter(b => ids.has(b.id) && !b.spent)
  })
  // angestoßene Zahlungen (Bezahlen, bezahlwache.ts) — ohne „zurückholen“, das entscheidet die Wache
  const zahlungen = createMemo(() => bearers().filter(istZahlung))
  return (
    <Show when={liste().length > 0 || zahlungen().length > 0}>
      <section class="rz-unterwegs">
        <div class="rz-tag">Unterwegs</div>
        <For each={zahlungen()}>
          {b => (
            <div class="rz-zeile">
              <span class="rz-lampe-klein" />
              <span>{b.zahlung?.text}</span>
              <span class="rz-matt">
                {b.zahlung?.schwebt
                  ? `hängt bei ${host(b.url)}`
                  : `${host(b.url)} · wird bestätigt …`}
              </span>
            </div>
          )}
        </For>
        <Show when={liste().length > 0}>
          <p class="rz-hinweis">
            Übergeben, aber noch nicht eingelöst — die Wallet fragt nach,
            solange sie offen ist.
          </p>
        </Show>
        <For each={liste()}>
          {bearer => (
            <div class="rz-zeile">
              <span class="rz-lampe-klein" />
              <span>
                {Math.floor(bearer.amount / 1000).toLocaleString('de-DE')} Sats
              </span>
              <span class="rz-matt">{host(bearer.url)}</span>
              {/* Auftrag liegt: leuchtend wie unter Scheine, keine blasse Taste (Gerhard, 2026-10-16) */}
              <Show
                when={!zurueckzuholen().includes(bearer.id)}
                fallback={
                  <span class="rz-unterwegs-zeile rz-zeilenknopf">
                    wird zurückgeholt …
                  </span>
                }
              >
                <button
                  type="button"
                  class="rz-leise rz-zeilenknopf"
                  disabled={holt() === bearer.id}
                  onClick={() => void zurueckholen(bearer.id)}
                >
                  {holt() === bearer.id ? '…' : 'zurückholen'}
                </button>
              </Show>
            </div>
          )}
        </For>
      </section>
    </Show>
  )
}

export default UnterwegsListe
