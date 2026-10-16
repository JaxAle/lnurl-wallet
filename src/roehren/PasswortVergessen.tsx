// Passwort vergessen — geführter Weg mit den zwölf Wörtern (Steve, 2026-10-15). Erreichbar vom
// Sperrbildschirm und von „Passwort ändern“; geht auch, wenn die Wallet gesperrt ist. Ergebnis: dieselbe
// Wallet, alle Scheine da, ein neues Passwort. Die Arbeit tut passwort.ts › passwortVergessen.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {notify} from '../helpers'
import {useWallet} from '../WalletContext'
import {passwortVergessen} from './passwort'
import {codeFehler, merkeLaenge, normalisiere} from './roehrencode'
import './roehren.css'

const PasswortVergessen: Component = () => {
  const {state, unlock, lock} = useWallet()
  const navigate = useNavigate()
  const [woerter, setWoerter] = createSignal('')
  const [pw, setPw] = createSignal('')
  const [pw2, setPw2] = createSignal('')
  const [arbeitet, setArbeitet] = createSignal(false)
  const [fehler, setFehler] = createSignal<string | null>(null)

  const problem = () => {
    if (woerter().trim().split(/\s+/).length < 12)
      return 'Bitte alle zwölf Wörter eingeben.'
    const f = codeFehler(pw())
    if (f) return f
    if (normalisiere(pw()) !== normalisiere(pw2()))
      return 'Die beiden Passwörter stimmen nicht überein.'
    return null
  }

  const los = async () => {
    if (problem()) return
    setArbeitet(true)
    setFehler(null)
    try {
      const r = await passwortVergessen(woerter(), normalisiere(pw()))
      merkeLaenge(pw().length)
      // mit dem neuen Passwort öffnen — so lädt die Wallet alles unter dem einen Schlüssel neu
      if (state() === 'unlocked') lock()
      await unlock(normalisiere(pw()))
      setWoerter('')
      setPw('')
      setPw2('')
      notify(
        `Neues Passwort gesetzt. ${r.scheine} ${r.scheine === 1 ? 'Schein ist' : 'Scheine sind'} da` +
          (r.doppelt > 0 ? `, ${r.doppelt} doppelte zusammengelegt.` : '.')
      )
      navigate('/wallet')
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setArbeitet(false)
    }
  }

  return (
    <div class="page rz-einstellungen">
      <div class="rz-seitenkopf">
        <A href="/wallet" class="rz-zurueck" aria-label="Zurück">
          ‹
        </A>
        <h2>Passwort vergessen</h2>
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
          Mit deinen zwölf Wörtern setzt du ein neues Passwort. Es bleibt
          dieselbe Wallet mit allen Scheinen — die Wallet prüft vorher, dass die
          Wörter zu ihr gehören.
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
        <label class="rz-feldname" for="pv-pw">
          Neues Passwort
        </label>
        <input
          id="pv-pw"
          class="rz-feld"
          type="password"
          autocomplete="new-password"
          value={pw()}
          onInput={e => setPw(e.currentTarget.value)}
        />
        <label class="rz-feldname" for="pv-pw2">
          Neues Passwort wiederholen
        </label>
        <input
          id="pv-pw2"
          class="rz-feld"
          type="password"
          autocomplete="new-password"
          value={pw2()}
          onInput={e => setPw2(e.currentTarget.value)}
        />
        <Show when={(woerter() || pw()) && problem()}>
          <p class="rz-hinweis">{problem()}</p>
        </Show>
        <Show when={fehler()}>
          <p class="rz-erkannt fremd">{fehler()}</p>
        </Show>
        <button
          type="button"
          class="rz-knopf an rz-weiter"
          disabled={!!problem() || arbeitet()}
          onClick={() => void los()}
        >
          <span class="lbl">
            {arbeitet() ? 'Einen Moment …' : 'Neues Passwort setzen'}
          </span>
        </button>
      </Show>
    </div>
  )
}

export default PasswortVergessen
