// Einstellungen › Passwort ändern / setzen (Gerhard, 2026-10-13). Ein eigener Bildschirm wie im Bedienfeld;
// die Arbeit tut passwort.ts. Nach dem Ändern ein Satz und der ehrliche Hinweis auf alte Sicherungen.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import {MIN_PASSWORD_LENGTH} from '../pages/Setup'
import {downloadBackupFile} from '../storage'
import {useWallet} from '../WalletContext'
import {pruefePasswort, setzePasswort} from './passwort'
import './roehren.css'

const PasswortSeite: Component = () => {
  const {encrypted} = useWallet()
  const navigate = useNavigate()
  // einmal beim Öffnen: hat die Wallet schon eines? (encrypted() liest den Speicher, ist nicht reaktiv)
  const hatte = encrypted()
  const [alt, setAlt] = createSignal('')
  const [neu, setNeu] = createSignal('')
  const [nochmal, setNochmal] = createSignal('')
  const [arbeitet, setArbeitet] = createSignal(false)
  const [fehler, setFehler] = createSignal<string | null>(null)
  const [fertig, setFertig] = createSignal(false)
  // zwei Schritte: erst das bisherige allein, dann die neuen — Bitwarden füllte sonst alle drei Felder
  // mit dem bisherigen (Gerhard am Pixel, 2026-10-13)
  const [geprueft, setGeprueft] = createSignal(!hatte)

  const weiter = async () => {
    if (!alt()) return
    setArbeitet(true)
    setFehler(null)
    const ok = await pruefePasswort(alt())
    setArbeitet(false)
    if (ok) setGeprueft(true)
    else setFehler('Das bisherige Passwort stimmt nicht.')
  }

  const problem = () => {
    if (hatte && !alt()) return 'Bitte das bisherige Passwort eingeben.'
    if (neu().length < MIN_PASSWORD_LENGTH) return `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`
    if (neu() !== nochmal()) return 'Die beiden neuen Passwörter stimmen nicht überein.'
    if (hatte && neu() === alt()) return 'Das neue Passwort ist dasselbe wie das bisherige.'
    return null
  }

  const los = async () => {
    if (problem()) return
    setArbeitet(true)
    setFehler(null)
    try {
      await setzePasswort(hatte ? alt() : undefined, neu())
      setAlt('')
      setNeu('')
      setNochmal('')
      setFertig(true)
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setArbeitet(false)
    }
  }

  const feld = (props: {id: string; label: string; wert: () => string; setze: (v: string) => void; neu?: boolean}) => (
    <>
      <label class="rz-feldname" for={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        class="rz-feld"
        type="password"
        autocomplete={props.neu ? 'new-password' : 'current-password'}
        autocapitalize="off"
        spellcheck={false}
        value={props.wert()}
        onInput={e => props.setze(e.currentTarget.value)}
      />
    </>
  )

  return (
    <RequireWallet>
      <div class="page rz-einstellungen">
        <div class="rz-seitenkopf">
          <A href="/settings" class="rz-zurueck" aria-label="Zurück zu den Einstellungen">
            ‹
          </A>
          <h2>{hatte ? 'Passwort ändern' : 'Passwort setzen'}</h2>
        </div>

        <Show
          when={!fertig()}
          fallback={
            <div class="rz-frage">
              <h3>{hatte ? 'Passwort geändert.' : 'Passwort gesetzt.'}</h3>
              <p>Ab jetzt öffnet sich die Wallet auf diesem Gerät nur mit dem neuen Passwort.</p>
              <p class="rz-hinweis">
                Hast du es in einem Passwortmanager (z. B. Bitwarden) gespeichert, trag dort jetzt das neue ein.
              </p>
              <p class="rz-hinweis">
                Sicherungsdateien von früher öffnen sich weiter mit dem Passwort, das beim Herunterladen galt
                {hatte ? '' : ' — oder ohne'}. Lade jetzt eine neue Sicherung herunter.
              </p>
              <button type="button" class="rz-knopf an rz-weiter" onClick={downloadBackupFile}>
                <span class="lbl">Neue Sicherung herunterladen</span>
              </button>
              <button type="button" class="rz-leise rz-block rz-mitte" onClick={() => navigate('/settings')}>
                Fertig
              </button>
            </div>
          }
        >
          <p class="rz-hinweis">
            {hatte
              ? 'Das Passwort schützt die Wallet auf diesem Gerät. Deine Scheine und deine zwölf Wörter bleiben dieselben.'
              : 'Ohne Passwort öffnet sich die Wallet von selbst. Mit Passwort braucht es zum Öffnen dieses Passwort — und das automatische Sperren wirkt.'}
          </p>
          <Show
            when={geprueft()}
            fallback={
              <>
                {feld({id: 'pw-alt', label: 'Bisheriges Passwort', wert: alt, setze: setAlt})}
                <Show when={fehler()}>
                  <p class="rz-erkannt fremd">{fehler()}</p>
                </Show>
                <button type="button" class="rz-knopf an rz-weiter" disabled={!alt() || arbeitet()} onClick={() => void weiter()}>
                  <span class="lbl">{arbeitet() ? 'Einen Moment …' : 'Weiter'}</span>
                </button>
              </>
            }
          >
            {feld({id: 'pw-neu', label: 'Neues Passwort', wert: neu, setze: setNeu, neu: true})}
            {feld({id: 'pw-nochmal', label: 'Neues Passwort wiederholen', wert: nochmal, setze: setNochmal, neu: true})}
            <Show when={(neu() || nochmal()) && problem()}>
              <p class="rz-hinweis">{problem()}</p>
            </Show>
            <Show when={fehler()}>
              <p class="rz-erkannt fremd">{fehler()}</p>
            </Show>
            <button type="button" class="rz-knopf an rz-weiter" disabled={!!problem() || arbeitet()} onClick={() => void los()}>
              <span class="lbl">{arbeitet() ? 'Einen Moment …' : hatte ? 'Passwort ändern' : 'Passwort setzen'}</span>
            </button>
          </Show>
        </Show>
      </div>
    </RequireWallet>
  )
}

export default PasswortSeite
