// Sicherung einspielen — eigener Bildschirm statt der Karte im Original (Steve, 2026-10-15: gebraucht im
// Notfall, also dort, wo ein Design-Bruch am meisten stört). Schritt für Schritt: Datei wählen, sagen was
// drin ist, einspielen, Ergebnis. Die Arbeit tut applyBackup des Originals (storage.ts), unverändert.
import type {Component} from 'solid-js'
import {createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {applyBackup, MAX_BACKUP_FILE_BYTES} from '../storage'
import type {BackupFile, RestoreResult} from '../storage'
import {useWallet} from '../WalletContext'
import {vergissLaenge} from './roehrencode'
import './roehren.css'

type Inhalt = {
  daten: unknown
  scheine: number
  stellen: number
  schluessel: 'verschluesselt' | 'offen' | 'keiner'
  vom: string
}

const lies = (daten: unknown): Inhalt | null => {
  const d = daten as Partial<BackupFile>
  if (!d || d.type !== 'lnurlwallet-backup' || !Array.isArray(d.bearers))
    return null
  const k = d.storageRootKey ?? d.linkingKey
  return {
    daten,
    scheine: d.bearers.length,
    stellen: d.trustedMints?.length ?? 0,
    schluessel: !k ? 'keiner' : k.enc ? 'verschluesselt' : 'offen',
    vom: d.createdAt
      ? new Date(d.createdAt).toLocaleString('de-DE', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      : 'unbekannt'
  }
}

const SicherungEinspielen: Component = () => {
  const {state, encrypted, reloadBearers, refreshState, unlock} = useWallet()
  const navigate = useNavigate()
  let datei: HTMLInputElement | undefined
  const [inhalt, setInhalt] = createSignal<Inhalt | null>(null)
  const [fehler, setFehler] = createSignal<string | null>(null)
  const [ergebnis, setErgebnis] = createSignal<RestoreResult | null>(null)
  const [arbeitet, setArbeitet] = createSignal(false)
  const ohneWallet = () => state() === 'none'

  const gewaehlt = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    setFehler(null)
    setInhalt(null)
    if (!f) return
    try {
      if (f.size > MAX_BACKUP_FILE_BYTES)
        throw new Error(
          'Diese Datei ist viel zu groß für eine Wallet-Sicherung.'
        )
      const i = lies(JSON.parse(await f.text()))
      if (!i) throw new Error('Das ist keine Sicherungsdatei dieser Wallet.')
      setInhalt(i)
    } catch (err) {
      setFehler(
        err instanceof SyntaxError
          ? 'Die Datei lässt sich nicht lesen.'
          : (err as Error).message
      )
    }
  }

  const einspielen = async () => {
    const i = inhalt()
    if (!i) return
    setArbeitet(true)
    setFehler(null)
    try {
      const r = applyBackup(i.daten)
      // ein eingespielter Schlüssel kann einen anderen Code haben — Länge nicht mehr annehmen
      if (r.linkingKeyRestored) vergissLaenge()
      if (state() === 'unlocked') await reloadBearers()
      if (r.linkingKeyRestored) refreshState()
      setErgebnis(r)
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setArbeitet(false)
    }
  }

  // ein unverschlüsselt gespeicherter Schlüssel aus der Datei: erst nach Bestätigung verwenden (Original)
  const verwenden = async () => {
    try {
      await unlock()
      navigate('/wallet')
    } catch (err) {
      setFehler((err as Error).message)
    }
  }

  return (
    <div class="page rz-einstellungen">
      <div class="rz-seitenkopf">
        <A
          href={ohneWallet() ? '/' : '/settings'}
          class="rz-zurueck"
          aria-label="Zurück"
        >
          ‹
        </A>
        <h2>Sicherung einspielen</h2>
      </div>
      <input
        ref={datei}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={gewaehlt}
      />

      <Show
        when={!ergebnis()}
        fallback={
          <div class="rz-frage">
            <h3>Eingespielt.</h3>
            <p>
              {ergebnis()!.added}{' '}
              {ergebnis()!.added === 1 ? 'Schein' : 'Scheine'} dazugekommen
              {ergebnis()!.skipped > 0
                ? `, ${ergebnis()!.skipped} waren schon da`
                : ''}
              {ergebnis()!.trustedMintsAdded > 0
                ? `, ${ergebnis()!.trustedMintsAdded} ${ergebnis()!.trustedMintsAdded === 1 ? 'Ausgabestelle' : 'Ausgabestellen'} neu`
                : ''}
              .
            </p>
            <Show when={ergebnis()!.linkingKeyRestored}>
              <p class="rz-hinweis">
                Der Schlüssel aus der Sicherung ist jetzt auf diesem Gerät. Wer
                die Datei erstellt hat, kennt ihn vielleicht — mach nur weiter,
                wenn es deine eigene Sicherung ist.
              </p>
              <Show
                when={encrypted()}
                fallback={
                  <button
                    type="button"
                    class="rz-knopf an rz-weiter"
                    onClick={() => void verwenden()}
                  >
                    <span class="lbl">Meine Sicherung — Wallet verwenden</span>
                  </button>
                }
              >
                <A href="/wallet" class="rz-knopf an rz-weiter rz-link-knopf">
                  <span class="lbl">Mit dem Passwort der Sicherung öffnen</span>
                </A>
              </Show>
            </Show>
            <Show when={ergebnis()!.linkingKeySkipped}>
              <p class="rz-hinweis">
                Auf diesem Gerät gibt es schon eine Wallet, deshalb blieb ihr
                Schlüssel. Scheine aus einer Sicherung mit anderem Schlüssel
                sind hier zwar abgelegt, aber nicht lesbar. Ist es die falsche
                Wallet: unter Einstellungen › Gerät die Wallet entfernen
                (gefahrlos, wenn sie leer ist) und die Datei noch einmal
                einspielen.
              </p>
            </Show>
            <Show when={!ergebnis()!.linkingKeyRestored}>
              <A href="/wallet" class="rz-knopf an rz-weiter rz-link-knopf">
                <span class="lbl">Zur Wallet</span>
              </A>
            </Show>
          </div>
        }
      >
        <p class="rz-hinweis">
          Eine Sicherungsdatei enthält deine Scheine — verschlüsselt — und deine
          Ausgabestellen. Lesbar sind die Scheine nur mit dem Schlüssel, mit dem
          sie verschlüsselt wurden.
        </p>
        <Show when={!inhalt()}>
          <button
            type="button"
            class="rz-knopf an rz-weiter"
            onClick={() => datei?.click()}
          >
            <span class="lbl">Sicherungsdatei wählen</span>
          </button>
        </Show>

        <Show when={inhalt()}>
          {i => (
            <div class="rz-gruppe">
              <span class="rz-eyebrow">In dieser Datei</span>
              <div class="rz-setting rz-still">
                <span>
                  <span class="sl">Scheine</span>
                </span>
                <span class="val">{i().scheine}</span>
              </div>
              <div class="rz-setting rz-still">
                <span>
                  <span class="sl">Ausgabestellen</span>
                </span>
                <span class="val">{i().stellen}</span>
              </div>
              <div class="rz-setting rz-still">
                <span>
                  <span class="sl">Schlüssel</span>
                  <span class="s">
                    {i().schluessel === 'verschluesselt'
                      ? 'Mit Passwort geschützt — auf einem neuen Gerät reicht die Datei plus Passwort'
                      : i().schluessel === 'offen'
                        ? 'Ohne Passwort gespeichert'
                        : 'Nicht dabei — zuerst die Wallet mit den zwölf Wörtern wiederherstellen'}
                  </span>
                </span>
                <span class="val">
                  {i().schluessel === 'verschluesselt'
                    ? 'dabei'
                    : i().schluessel === 'offen'
                      ? 'dabei'
                      : 'fehlt'}
                </span>
              </div>
              <div class="rz-setting rz-still">
                <span>
                  <span class="sl">Erstellt</span>
                </span>
                <span class="val">{i().vom}</span>
              </div>

              {/* die Reihenfolge zählt (Original): ohne Schlüssel in der Datei zuerst die zwölf Wörter */}
              <Show
                when={!(ohneWallet() && i().schluessel === 'keiner')}
                fallback={
                  <>
                    <p class="rz-hinweis">
                      Auf diesem Gerät ist noch keine Wallet, und die Datei
                      bringt keinen Schlüssel mit. Stell zuerst deine Wallet mit
                      den zwölf Wörtern wieder her und spiel die Datei danach
                      ein.
                    </p>
                    <A
                      href="/setup?tab=restore"
                      class="rz-knopf an rz-weiter rz-link-knopf"
                    >
                      <span class="lbl">
                        Mit zwölf Wörtern wiederherstellen
                      </span>
                    </A>
                  </>
                }
              >
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  disabled={arbeitet()}
                  onClick={() => void einspielen()}
                >
                  <span class="lbl">
                    {arbeitet() ? 'Einen Moment …' : 'Einspielen'}
                  </span>
                </button>
              </Show>
              <button
                type="button"
                class="rz-leise rz-block rz-mitte"
                onClick={() => datei?.click()}
              >
                Andere Datei wählen
              </button>
            </div>
          )}
        </Show>
      </Show>

      <Show when={fehler()}>
        <p class="rz-erkannt fremd">{fehler()}</p>
      </Show>
    </div>
  )
}

export default SicherungEinspielen
