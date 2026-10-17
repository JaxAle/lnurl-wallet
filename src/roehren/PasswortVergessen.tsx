// Passwort vergessen — geführter Weg mit den zwölf Wörtern (Steve, 2026-10-15). Erreichbar vom
// Sperrbildschirm und von „Passwort ändern“; geht auch, wenn die Wallet gesperrt ist. Ergebnis: dieselbe
// Wallet, alle Scheine da, ein neues Passwort. Die Arbeit tut passwort.ts › passwortVergessen.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {notify} from '../helpers'
import {useWallet} from '../WalletContext'
import {passwortVergessen} from './passwort'
import CodeFestlegen from './CodeFestlegen'
import {merkeLaenge, vergissLaenge} from './roehrencode'
import './roehren.css'

const PasswortVergessen: Component = () => {
  const {state, unlock, lock} = useWallet()
  const navigate = useNavigate()
  const [woerter, setWoerter] = createSignal('')
  // erst die Wörter, dann der neue Code auf den Röhren (Steve, 2026-10-17)
  const [codeSchritt, setCodeSchritt] = createSignal(false)
  const [fehler, setFehler] = createSignal<string | null>(null)

  const problem = () =>
    woerter().trim().split(/\s+/).length < 12
      ? 'Bitte alle zwölf Wörter eingeben.'
      : null

  const setze = async (code: string, ausManager: boolean) => {
    try {
      const r = await passwortVergessen(woerter(), code)
      if (ausManager) vergissLaenge()
      else merkeLaenge(code.length)
      // mit dem neuen Code öffnen — so lädt die Wallet alles unter dem einen Schlüssel neu
      if (state() === 'unlocked') lock()
      await unlock(code)
      setWoerter('')
      notify(
        `Neuer Code gesetzt. ${r.scheine} ${r.scheine === 1 ? 'Schein ist' : 'Scheine sind'} da` +
          (r.doppelt > 0 ? `, ${r.doppelt} doppelte zusammengelegt.` : '.')
      )
      navigate('/wallet')
      return null
    } catch (err) {
      // meist die Wörter: zurück zu ihnen, mit dem Grund
      setFehler((err as Error).message)
      setCodeSchritt(false)
      return (err as Error).message
    }
  }

  return (
    <div class="page rz-einstellungen">
      <div class="rz-seitenkopf">
        <A href="/wallet" class="rz-zurueck" aria-label="Zurück">
          ‹
        </A>
        <h2>Code vergessen</h2>
      </div>
      <Show
        when={state() !== 'none'}
        fallback={
          <p class="rz-hinweis">
            Auf diesem Gerät ist keine Wallet.{' '}
            <A href="/setup?tab=restore">
              Mit zwölf Wörtern wiederherstellen ›
            </A>
          </p>
        }
      >
        <p class="rz-hinweis">
          Mit deinen zwölf Wörtern setzt du einen neuen Code. Es bleibt dieselbe
          Wallet mit allen Scheinen — die Wallet prüft vorher, dass die Wörter
          zu ihr gehören.
        </p>
        <label class="rz-feldname" for="pv-woerter">
          Deine zwölf Wörter
        </label>
        <textarea
          id="pv-woerter"
          class="rz-feld"
          rows="3"
          placeholder="zwölf Wörter, mit Leerzeichen getrennt"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          data-1p-ignore
          data-lpignore="true"
          value={woerter()}
          onInput={e => setWoerter(e.currentTarget.value)}
        />
        <Show when={woerter() && problem()}>
          <p class="rz-hinweis">{problem()}</p>
        </Show>
        <Show when={fehler()}>
          <p class="rz-erkannt fremd">{fehler()}</p>
        </Show>
        <button
          type="button"
          class="rz-knopf an rz-weiter"
          disabled={!!problem()}
          onClick={() => {
            setFehler(null)
            setCodeSchritt(true)
          }}
        >
          <span class="lbl">Weiter zum neuen Code</span>
        </button>
        <Show when={codeSchritt()}>
          <CodeFestlegen
            titel="Neuer Code"
            zurueck={() => setCodeSchritt(false)}
            onCode={setze}
          />
        </Show>
      </Show>
    </div>
  )
}

export default PasswortVergessen
