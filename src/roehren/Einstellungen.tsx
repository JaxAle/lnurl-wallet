// Einstellungen wie im Prototyp (screens.settings): ein Bedienfeld aus Gruppen und Zeilen statt der
// Karten des Originals mit je einem Absatz. Antippen schaltet weiter (wie dort „autolock“); was
// mehr braucht — Sicherung einspielen, Verschlüsselung erneuern, Extras verwalten —, liegt
// unverändert im Original unter /settings/erweitert.
//
// Weggelassen gegenüber dem Prototyp: Profi-Modus (Reiter Scheine immer sichtbar, Gerhard),
// Sprache (nur Deutsch), Code an/aus/ändern und Wörter anzeigen — das Original setzt das Passwort
// nur beim Einrichten und behält die zwölf Wörter nicht.
import type {Component, JSX} from 'solid-js'
import {createSignal, For, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {
  AUTO_LOCK_LABEL,
  AUTO_LOCK_OPTIONS,
  autoLockMinutes,
  setAutoLockMinutes
} from '../autoLock'
import {currency, setCurrency} from '../currency'
import type {Currency} from '../currency'
import {downloadBackupFile} from '../storage'
import {trustedMints} from '../trustedMints'
import {vaultEnabled} from '../vaultFeature'
import {useWallet} from '../WalletContext'
import {isCk1, noteK1} from '../lnurlcash'
import {Gruppe, Zeile} from './Bedienfeld'
import {leuchtkraft, setLeuchtkraft, STUFE_TEXT, STUFEN} from './leuchtkraft'
import {HAEUTE, haut, HAUT_TEXT, setHaut} from './haut'
import Rueckfrage from './Rueckfrage'
import {vergissWoerter} from './woerterTresor'
import './roehren.css'

// Bauzeit in Ortszeit, z. B. „11.10.2026, 21:40“ — daran erkennt man am Gerät, ob „Neu laden“ gegriffen hat
const FASSUNG = new Date(__BAU_ZEIT__).toLocaleString('de-AT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

const WAEHRUNGEN: Currency[] = ['eur', 'usd', 'gbp', 'none']
const WAEHRUNG_NAME: Record<Currency, string> = {
  eur: 'Euro',
  usd: 'US-Dollar',
  gbp: 'Pfund',
  none: 'Aus'
}

// nächster Wert in der Reihe, am Ende wieder von vorn (Prototyp: autolock)
const weiter = <T,>(reihe: readonly T[], jetzt: T): T =>
  reihe[(reihe.indexOf(jetzt) + 1) % reihe.length]

const host = (origin: string): string => {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

const Einstellungen: Component = () => {
  const {
    state,
    encrypted,
    encryptionUpgraded,
    forgetWallet,
    activity,
    clearActivity,
    bearers
  } = useWallet()
  // Scheine, die sich mit den zwölf Wörtern nicht wiederfinden lassen: alles ohne seed-abgeleitetes
  // Geheimnis (ck1) und alles Ungeprüfte — beim Entfernen ausdrücklich nennen (am iPad gingen so
  // 100 Sats verloren, 2026-10-15)
  const nurMitSicherung = () =>
    bearers().filter(
      b => !b.spent && (!b.verified || !isCk1(noteK1(b.url) ?? ''))
    )
  const navigate = useNavigate()
  const [fragt, setFragt] = createSignal(false)
  const [verlaufFrage, setVerlaufFrage] = createSignal(false)
  const offen = () => state() === 'unlocked'

  const entfernen = () => {
    forgetWallet()
    vergissWoerter()
    setFragt(false)
    navigate('/')
  }

  return (
    <div class="page rz-einstellungen">
      <h2 class="rz-titel">Einstellungen</h2>

      <Gruppe titel="Sicherheit">
        <Show when={offen()}>
          <Zeile
            label={encrypted() ? 'Code ändern' : 'Code setzen'}
            unter={
              encrypted() ? undefined : 'Schützt die Wallet auf diesem Gerät'
            }
            href="/settings/passwort"
          />
          {/* die Wörter hinter dem Code (Gerhard/Steve, 2026-10-19) */}
          <Zeile
            label="Zwölf Wörter"
            unter="Anzeigen oder prüfen — mit deinem Code"
            href="/settings/woerter"
          />
        </Show>
        <Zeile
          label="Automatisch sperren"
          wert={AUTO_LOCK_LABEL[autoLockMinutes()]}
          unter={
            encrypted()
              ? undefined
              : 'Wirkt nur, wenn die Wallet ein Passwort hat'
          }
          onClick={() =>
            setAutoLockMinutes(weiter(AUTO_LOCK_OPTIONS, autoLockMinutes()))
          }
        />
        <Show when={offen() && !encryptionUpgraded()}>
          <Zeile
            label="Verschlüsselung erneuern"
            unter="Einmal nötig — mit deinen zwölf Wörtern"
            href="/settings/verschluesselung"
          />
        </Show>
      </Gruppe>

      <Gruppe titel="Sicherung">
        <Show when={offen()}>
          <Zeile
            label="Sicherung erstellen"
            unter={
              encrypted()
                ? 'Eine Datei mit allen Scheinen, verschlüsselt'
                : 'Eine Datei mit allen Scheinen — einspielen geht nur mit deinen zwölf Wörtern'
            }
            onClick={downloadBackupFile}
          />
        </Show>
        <Zeile
          label="Sicherung einspielen"
          href="/settings/sicherung-einspielen"
        />
        <Show when={offen()}>
          <Zeile
            label="Scheine wiederfinden"
            unter="Mit deinen zwölf Wörtern, bei allen Ausgabestellen"
            href="/settings/wiederfinden"
          />
        </Show>
      </Gruppe>

      {/* Extras: eine Zeile zur Seite mit den vier für Menschen; die Entwicklerwerkzeuge liegen
      dort unter „Für Entwickler“ (Steve, 2026-10-17) */}
      <Gruppe titel="Extras">
        <Zeile label="Extras" wert="Geschenkkarte, Tombola …" href="/extras" />
        <Show when={vaultEnabled()}>
          <Zeile label="Hardware-Tresor" href="/vault" />
        </Show>
      </Gruppe>

      <Gruppe titel="Anzeige">
        <Zeile
          label="Design"
          unter="Antippen wechselt — Röhren oder Fallblatt"
          wert={HAUT_TEXT[haut()]}
          onClick={() =>
            setHaut(HAEUTE[(HAEUTE.indexOf(haut()) + 1) % HAEUTE.length])
          }
        />
        <Zeile
          label="Leuchtkraft"
          unter="Die ganze Oberfläche heller — antippen wechselt"
          wert={STUFE_TEXT[leuchtkraft()]}
          onClick={() =>
            setLeuchtkraft(
              STUFEN[(STUFEN.indexOf(leuchtkraft()) + 1) % STUFEN.length]
            )
          }
        />
        <Zeile
          label="Währung"
          wert={WAEHRUNG_NAME[currency()]}
          onClick={() => setCurrency(weiter(WAEHRUNGEN, currency()))}
        />
      </Gruppe>

      <Gruppe titel="Ausgabestellen">
        <Zeile
          label={trustedMints().length > 1 ? 'Ausgabestellen' : 'Ausgabestelle'}
          wert={
            trustedMints().length > 0
              ? trustedMints()
                  .map(m => host(m.server))
                  .join(', ')
              : 'keine'
          }
          href="/mint"
        />
      </Gruppe>

      {/* Technisches (Offline, Suchtiefe, Tresor) liegt unter Extras › Für Entwickler; hier nur, was
      jeder braucht — vorher doppelt versteckt unter „Werkzeuge › Erweitert“ (Gerhard, 2026-10-19) */}
      <Gruppe titel="Über die Wallet">
        <Zeile label="So funktioniert die Wallet" href="/ueber" />
        <Show when={offen() && activity().length > 0}>
          <Zeile
            label="Verlauf löschen"
            onClick={() => setVerlaufFrage(true)}
          />
          <Show when={verlaufFrage()}>
            <Rueckfrage
              titel="Verlauf löschen?"
              ja="Löschen"
              onJa={() => {
                clearActivity()
                setVerlaufFrage(false)
              }}
              onNein={() => setVerlaufFrage(false)}
            >
              <p>
                Nur die Liste im Verlauf verschwindet — deine Scheine bleiben
                unberührt.
              </p>
            </Rueckfrage>
          </Show>
        </Show>
      </Gruppe>

      <Show when={state() !== 'none'}>
        <Gruppe titel="Gerät">
          <Zeile
            label="Wallet von diesem Gerät entfernen"
            unter="Danach beginnt die App von vorn"
            gefahr
            onClick={() => setFragt(true)}
          />
          <Show when={fragt()}>
            <Rueckfrage
              titel="Wallet von diesem Gerät entfernen?"
              ja="Entfernen"
              onJa={entfernen}
              nein={offen() ? 'Erst sichern' : undefined}
              onNein={() => {
                if (offen()) downloadBackupFile()
                setFragt(false)
              }}
            >
              <Show
                when={offen() && nurMitSicherung().length > 0}
                fallback={
                  <p>
                    Hast du eine Sicherung? Die zwölf Wörter finden nur Scheine
                    wieder, die diese Wallet selbst erzeugt hat — alles andere
                    bringt nur eine Sicherung zurück.
                  </p>
                }
              >
                <p>
                  <b>
                    {nurMitSicherung().length}{' '}
                    {nurMitSicherung().length === 1 ? 'Schein' : 'Scheine'} (
                    {nurMitSicherung()
                      .reduce((a, b) => a + Math.floor(b.amount / 1000), 0)
                      .toLocaleString('de-DE')}{' '}
                    Sats)
                  </b>{' '}
                  {nurMitSicherung().length === 1 ? 'lässt' : 'lassen'} sich mit
                  den zwölf Wörtern nicht wiederfinden — nur mit einer
                  Sicherung. Lade sie zuerst herunter.
                </p>
              </Show>
            </Rueckfrage>
          </Show>
        </Gruppe>
      </Show>

      <p class="rz-fuss">
        Läuft mit LNURLcash. Schlüssel verlassen dieses Gerät nie.
        <br />
        Fassung vom {FASSUNG}
        <span class="rz-fuss-klein">{__APP_VERSION__}</span>
      </p>
    </div>
  )
}

export default Einstellungen
