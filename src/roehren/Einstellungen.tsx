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

import {allAddons} from '../addons/registry'
import {enabledAddonIds} from '../addons/enabled'
import {
  AUTO_LOCK_LABEL,
  AUTO_LOCK_OPTIONS,
  autoLockMinutes,
  setAutoLockMinutes
} from '../autoLock'
import {currency, setCurrency} from '../currency'
import type {Currency} from '../currency'
import {
  GAP_LIMIT_LABEL,
  GAP_LIMIT_OPTIONS,
  gapLimit,
  setGapLimit
} from '../gapLimit'
import {offlineMode, setOfflineMode} from '../offlineMode'
import {downloadBackupFile} from '../storage'
import {trustedMints} from '../trustedMints'
import {setVaultEnabled, vaultEnabled} from '../vaultFeature'
import {useWallet} from '../WalletContext'
import {isCk1, noteK1} from '../lnurlcash'
import Rueckfrage from './Rueckfrage'
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

const Pfeil: Component = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 5l7 7-7 7" />
  </svg>
)

type ZeileProps = {
  label: string
  wert?: JSX.Element
  unter?: string
  href?: string
  onClick?: () => void
  gefahr?: boolean
}
// eine Zeile: links Beschriftung (Drahtschrift), rechts Wert in mattem Orange mit ›
const Zeile: Component<ZeileProps> = props => {
  const innen = (
    <>
      <span>
        <span class="sl">{props.label}</span>
        <Show when={props.unter}>
          <span class="s">{props.unter}</span>
        </Show>
      </span>
      <span class="val">
        {props.wert}
        <Pfeil />
      </span>
    </>
  )
  return (
    <Show
      when={props.href}
      fallback={
        <button
          type="button"
          class="rz-setting"
          classList={{gefahr: props.gefahr}}
          onClick={() => props.onClick?.()}
        >
          {innen}
        </button>
      }
    >
      <A
        href={props.href!}
        class="rz-setting"
        classList={{gefahr: props.gefahr}}
      >
        {innen}
      </A>
    </Show>
  )
}

const Schalter: Component<{
  label: string
  an: boolean
  unter?: string
  onClick: () => void
}> = props => (
  <button
    type="button"
    class="rz-setting"
    role="switch"
    aria-checked={props.an}
    onClick={() => props.onClick()}
  >
    <span>
      <span class="sl">{props.label}</span>
      <Show when={props.unter}>
        <span class="s">{props.unter}</span>
      </Show>
    </span>
    <span class="rz-switch" classList={{on: props.an}} />
  </button>
)

const Gruppe: Component<{titel: string; children: JSX.Element}> = props => (
  <div class="rz-gruppe">
    <span class="rz-eyebrow">{props.titel}</span>
    {props.children}
  </div>
)

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

  // eingeschaltete Extras mit eigener Seite — im Original standen sie im Menü
  const extras = () =>
    allAddons().filter(
      a => enabledAddonIds().has(a.manifest.id) && a.manifest.nav
    )

  const entfernen = () => {
    forgetWallet()
    setFragt(false)
    navigate('/')
  }

  return (
    <div class="page rz-einstellungen">
      <h2 class="rz-titel">Einstellungen</h2>

      <Gruppe titel="Sicherheit">
        <Show when={offen()}>
          <Zeile
            label={encrypted() ? 'Passwort ändern' : 'Passwort setzen'}
            unter={
              encrypted() ? undefined : 'Schützt die Wallet auf diesem Gerät'
            }
            href="/settings/passwort"
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

      <Gruppe titel="Extras">
        <For each={extras()}>
          {addon => (
            <Zeile
              label={addon.manifest.nav!.label}
              href={addon.manifest.nav!.route ?? `/addons/${addon.manifest.id}`}
            />
          )}
        </For>
        <Show when={vaultEnabled()}>
          <Zeile label="Hardware-Tresor" href="/vault" />
        </Show>
        <Zeile
          label="Extras"
          wert={
            extras().length > 0
              ? `${extras().length} an`
              : 'Geschenkkarte, Zeitschloss …'
          }
          href="/settings/erweitert?teil=extras"
        />
      </Gruppe>

      <Gruppe titel="Anzeige">
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

      <Gruppe titel="Werkzeuge">
        <details class="rz-erweitert">
          <summary>
            Erweitert <Pfeil />
          </summary>
          <Schalter
            label="Offline-Betrieb"
            unter="Keine Verbindung zu Ausgabestellen"
            an={offlineMode()}
            onClick={() => setOfflineMode(!offlineMode())}
          />
          <Zeile
            label="Suchtiefe beim Wiederherstellen"
            wert={GAP_LIMIT_LABEL[gapLimit()]}
            onClick={() => setGapLimit(weiter(GAP_LIMIT_OPTIONS, gapLimit()))}
          />
          <Schalter
            label="Hardware-Tresor (Alpha)"
            unter="LNURLvault über USB oder Bluetooth"
            an={vaultEnabled()}
            onClick={() => setVaultEnabled(!vaultEnabled())}
          />
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
        </details>
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
