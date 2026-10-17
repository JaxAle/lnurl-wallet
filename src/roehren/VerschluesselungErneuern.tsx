// Verschlüsselung erneuern — eigener Bildschirm statt der Karte im Original (Steve, 2026-10-15). Nur für
// Wallets aus einer älteren Fassung: die zwölf Wörter eingeben, die Wallet verschlüsselt Scheine und
// Verlauf mit einem einfacher abgeleiteten Schlüssel neu. Die Arbeit tut upgradeEncryption des Originals.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import {notify} from '../helpers'
import {MIN_PASSWORD_LENGTH} from '../pages/Setup'
import {useWallet} from '../WalletContext'
import {satzAus, woerterProblem} from './woerter'
import './roehren.css'

const VerschluesselungErneuern: Component = () => {
  const {encrypted, encryptionUpgraded, upgradeEncryption} = useWallet()
  const navigate = useNavigate()
  const mitPasswort = encrypted()
  const [woerter, setWoerter] = createSignal('')
  const [pw, setPw] = createSignal('')
  const [pw2, setPw2] = createSignal('')
  const [arbeitet, setArbeitet] = createSignal(false)
  const [fehler, setFehler] = createSignal<string | null>(null)

  const problem = () => {
    if (!woerter().trim()) return null
    const w = woerterProblem(woerter())
    if (w) return w
    if (mitPasswort && pw().length < MIN_PASSWORD_LENGTH)
      return `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`
    if (mitPasswort && pw() !== pw2())
      return 'Die Passwörter stimmen nicht überein.'
    return null
  }

  const los = async () => {
    if (!woerter().trim() || problem()) return
    setArbeitet(true)
    setFehler(null)
    try {
      await upgradeEncryption(
        satzAus(woerter()),
        mitPasswort ? pw() : undefined
      )
      setWoerter('')
      setPw('')
      setPw2('')
      notify('Verschlüsselung erneuert.')
      navigate('/settings')
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setArbeitet(false)
    }
  }

  return (
    <RequireWallet>
      <div class="page rz-einstellungen">
        <div class="rz-seitenkopf">
          <A
            href="/settings"
            class="rz-zurueck"
            aria-label="Zurück zu den Einstellungen"
          >
            ‹
          </A>
          <h2>Verschlüsselung erneuern</h2>
        </div>
        <Show
          when={!encryptionUpgraded()}
          fallback={
            <p class="rz-hinweis">
              Die Verschlüsselung dieser Wallet ist schon auf dem neuen Stand.
            </p>
          }
        >
          <p class="rz-hinweis">
            Deine Scheine sind noch mit einem Schlüssel aus einer älteren
            Fassung verschlüsselt. Mit deinen zwölf Wörtern verschlüsselt die
            Wallet Scheine und Verlauf neu. Wörter und Scheine bleiben
            dieselben.
          </p>
          <label class="rz-feldname" for="ve-woerter">
            Deine zwölf Wörter
          </label>
          <textarea
            id="ve-woerter"
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
          <Show when={mitPasswort}>
            <label class="rz-feldname" for="ve-pw">
              Passwort für den neuen Schlüssel
            </label>
            <input
              id="ve-pw"
              class="rz-feld"
              type="password"
              autocomplete="new-password"
              value={pw()}
              onInput={e => setPw(e.currentTarget.value)}
            />
            <label class="rz-feldname" for="ve-pw2">
              Passwort wiederholen
            </label>
            <input
              id="ve-pw2"
              class="rz-feld"
              type="password"
              autocomplete="new-password"
              value={pw2()}
              onInput={e => setPw2(e.currentTarget.value)}
            />
          </Show>
          <Show when={problem()}>
            <p class="rz-hinweis">{problem()}</p>
          </Show>
          <Show when={fehler()}>
            <p class="rz-erkannt fremd">{fehler()}</p>
          </Show>
          <button
            type="button"
            class="rz-knopf an rz-weiter"
            disabled={!woerter().trim() || !!problem() || arbeitet()}
            onClick={() => void los()}
          >
            <span class="lbl">
              {arbeitet() ? 'Einen Moment …' : 'Verschlüsselung erneuern'}
            </span>
          </button>
        </Show>
      </div>
    </RequireWallet>
  )
}

export default VerschluesselungErneuern
