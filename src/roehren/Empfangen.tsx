// Empfangen wie im Prototyp (screens.receive): drei große Zeilen mit je einem Satz statt einer
// Symbolreihe. Dahinter die Werkzeuge des Originals: Scanner, Einfügen aus der Zwischenablage,
// Aufladen (/mint). Was ankommt, verarbeitet die Startseite (uebergabe.ts) — dort zählt das
// Zählwerk hinauf. „Deine Adresse“ (Prototyp) folgt in einer späteren Schleife.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import Scanner, {canScan} from '../components/Scanner'
import {pasteFromClipboard} from '../helpers'
import {setEingang} from './uebergabe'
import './roehren.css'

// Symbole wörtlich aus dem Prototyp (Konstante I: scan, paste, bolt, chev)
const SYMBOLE: Record<string, string> = {
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h4"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
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

const Empfangen: Component = () => {
  const navigate = useNavigate()
  const [scannt, setScannt] = createSignal(false)
  const [tippt, setTippt] = createSignal(false)
  const [text, setText] = createSignal('')

  const uebernimm = (wert: string) => {
    const w = wert.trim()
    if (!w) return
    setEingang(w)
    navigate('/wallet')
  }

  const einfuegen = async () => {
    const t = await pasteFromClipboard()
    // ohne Erlaubnis für die Zwischenablage: Feld zum Hineinhalten
    if (t === null) return setTippt(true)
    uebernimm(t)
  }

  return (
    <RequireWallet>
      <div class="page rz-empfangen">
        <div class="rz-seitenkopf">
          <A href="/wallet" class="rz-zurueck" aria-label="Zurück zur Wallet">
            ‹
          </A>
          <h2>Empfangen</h2>
        </div>

        <Show when={canScan()}>
          <button type="button" class="rz-option" onClick={() => setScannt(v => !v)}>
            <span class="ic">
              <Symbol name="scan" />
            </span>
            <span>
              <span class="t">Schein scannen</span>
              <span class="s">Jemand zeigt dir einen QR-Code</span>
            </span>
            <Symbol name="chev" />
          </button>
          <Show when={scannt()}>
            <div class="rz-scanner">
              <Scanner onScan={uebernimm} />
              <p class="rz-hinweis">QR-Code ins Bild halten — erkannt wird von selbst.</p>
            </div>
          </Show>
        </Show>

        <button type="button" class="rz-option" onClick={() => void einfuegen()}>
          <span class="ic">
            <Symbol name="paste" />
          </span>
          <span>
            <span class="t">Schein einfügen</span>
            <span class="s">Du hast einen Link oder Text bekommen</span>
          </span>
          <Symbol name="chev" />
        </button>
        <Show when={tippt()}>
          <div class="rz-einfuegen">
            <input
              type="text"
              placeholder="Schein, Rechnung oder Adresse"
              value={text()}
              onInput={e => setText(e.currentTarget.value)}
              onKeyDown={e => e.key === 'Enter' && uebernimm(text())}
            />
            <button type="button" class="rz-leise" onClick={() => uebernimm(text())}>
              Übernehmen ›
            </button>
          </div>
        </Show>

        <A href="/mint" class="rz-option">
          <span class="ic">
            <Symbol name="bolt" />
          </span>
          <span>
            <span class="t">Aufladen per Lightning</span>
            <span class="s">Aus einer anderen Wallet Sats hierher holen</span>
          </span>
          <Symbol name="chev" />
        </A>
      </div>
    </RequireWallet>
  )
}

export default Empfangen
