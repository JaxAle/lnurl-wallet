// Einstellungen › Code ändern / setzen (Gerhard, 2026-10-13; auf den Röhren seit 2026-10-17, Steve): erst
// der bisherige Code auf dem Röhrenfeld (oder mit dem Schlüssel aus dem Passwortmanager), dann der neue —
// dort, wo man ihn später tippt. Die Arbeit tut passwort.ts. Danach ein Satz und der Hinweis auf alte
// Sicherungen.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import {downloadBackupFile} from '../storage'
import {useWallet} from '../WalletContext'
import CodeFestlegen from './CodeFestlegen'
import {pruefePasswort, setzePasswort} from './passwort'
import Roehrenfeld from './Roehrenfeld'
import {codeLaenge, kandidaten, merkeLaenge, vergissLaenge} from './roehrencode'
import './roehren.css'

const PasswortSeite: Component = () => {
  const {encrypted} = useWallet()
  const navigate = useNavigate()
  // einmal beim Öffnen: hat die Wallet schon einen? (encrypted() liest den Speicher, ist nicht reaktiv)
  const hatte = encrypted()
  const [alt, setAlt] = createSignal<string | null>(hatte ? null : '')
  const [fertig, setFertig] = createSignal(false)
  const zurueck = () => navigate('/settings')

  const pruefeAlt = async (code: string) => {
    for (const k of kandidaten(code)) {
      if (await pruefePasswort(k)) {
        setAlt(k)
        return 'weiter' as const
      }
    }
    return 'falsch' as const
  }

  const setze = async (code: string, ausManager: boolean) => {
    try {
      await setzePasswort(hatte ? alt()! : undefined, code)
      if (ausManager) vergissLaenge()
      else merkeLaenge(code.length)
      setFertig(true)
      return null
    } catch (err) {
      return (err as Error).message
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
          <h2>{hatte ? 'Code ändern' : 'Code setzen'}</h2>
        </div>

        <Show
          when={!fertig()}
          fallback={
            <div class="rz-frage">
              <h3>{hatte ? 'Code geändert.' : 'Code gesetzt.'}</h3>
              <p>
                Ab jetzt öffnet sich die Wallet auf diesem Gerät nur mit dem
                neuen Code.
              </p>
              <p class="rz-hinweis">
                Hast du den alten in einem Passwortmanager (z. B. Bitwarden)
                gespeichert, trag dort jetzt den neuen ein.
              </p>
              <p class="rz-hinweis">
                Sicherungsdateien von früher öffnen sich weiter mit dem Code,
                der beim Herunterladen galt
                {hatte ? '' : ' — oder ohne'}. Lade jetzt eine neue Sicherung
                herunter.
              </p>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                onClick={downloadBackupFile}
              >
                <span class="lbl">Neue Sicherung herunterladen</span>
              </button>
              <button
                type="button"
                class="rz-leise rz-block rz-mitte"
                onClick={() => navigate('/settings')}
              >
                Fertig
              </button>
            </div>
          }
        >
          <Show
            when={alt() !== null}
            fallback={
              <Roehrenfeld
                onCode={pruefeAlt}
                aktion="Weiter"
                autocomplete="current-password"
                laenge={codeLaenge()}
                kopf={
                  <>
                    <div class="rz-seitenkopf">
                      <button
                        type="button"
                        class="rz-zurueck"
                        aria-label="Zurück"
                        onClick={zurueck}
                      >
                        ‹
                      </button>
                      <h2>Bisheriger Code</h2>
                    </div>
                    <p>Erst der Code, mit dem du die Wallet heute öffnest.</p>
                  </>
                }
                unten={
                  <A href="/passwort-vergessen" class="rz-schloss-vergessen">
                    Code vergessen?
                  </A>
                }
              />
            }
          >
            <CodeFestlegen
              titel={hatte ? 'Neuer Code' : 'Code setzen'}
              zurueck={zurueck}
              onCode={setze}
            />
          </Show>
        </Show>
      </div>
    </RequireWallet>
  )
}

export default PasswortSeite
