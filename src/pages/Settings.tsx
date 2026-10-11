import type {Component} from 'solid-js'
import {For, Show, Switch, Match, createSignal, onMount} from 'solid-js'
import {A, useNavigate, useSearchParams} from '@solidjs/router'
import {
  IoCashSharp,
  IoCloudOfflineSharp,
  IoTimeSharp,
  IoDownloadSharp,
  IoTrashSharp,
  IoFolderOpenSharp,
  IoRefreshSharp,
  IoShieldCheckmarkSharp,
  IoSearchSharp,
  IoInformationCircleSharp,
  IoCogSharp,
  IoHardwareChipSharp,
  IoPowerSharp,
  IoOpenSharp,
  IoFlaskSharp
} from 'solid-icons/io'

import {useWallet} from '../WalletContext'
import {offlineMode, setOfflineMode} from '../offlineMode'
import {currency, setCurrency, CURRENCY_LABEL} from '../currency'
import type {Currency} from '../currency'
import {
  autoLockMinutes,
  setAutoLockMinutes,
  AUTO_LOCK_OPTIONS,
  AUTO_LOCK_LABEL
} from '../autoLock'
import {
  gapLimit,
  setGapLimit,
  GAP_LIMIT_OPTIONS,
  GAP_LIMIT_LABEL
} from '../gapLimit'
import {
  applyBackup,
  MAX_BACKUP_FILE_BYTES,
  downloadBackupFile
} from '../storage'
import {isValidSeedPhrase} from '../keys'
import {trustedMints} from '../trustedMints'
import {notify, NotifyKind} from '../helpers'
import {MIN_PASSWORD_LENGTH} from './Setup'
import {allAddons, isBundledAddon} from '../addons/registry'
import {enabledAddonIds, setAddonEnabled} from '../addons/enabled'
import {effectiveNavPosition, setAddonNavPosition} from '../addons/navPosition'
import {
  experimentalAddonsVisible,
  setExperimentalAddonsVisible
} from '../addons/experimentalVisible'
import {vaultEnabled, setVaultEnabled} from '../vaultFeature'
import {addonSettingsStore} from '../addons/settingsStore'
import {
  saveCustomAddon,
  deleteCustomAddon,
  isCustomAddon
} from '../addons/customAddons'
import {validateManifest} from '../addons/validate'
import {STARTER_TEMPLATE} from '../addons/starterTemplate'
import {ADDON_ICONS} from '../addons/icons'
import {defaultNodeFor, isSafeUiNode} from '../addons/uiTree'
import AddonRenderer from '../addons/Renderer'
import UiBuilder from '../addons/UiBuilder'
import Dialog from '../components/Dialog'
import type {
  AddonManifest,
  AddonNavEntry,
  Permission,
  UiNode
} from '../addons/types'

// order they appear - 'none' (Disabled) first since that's the default/off
// state, then alphabetical by the same three currencies price.lnbits.com
// serves directly (see currency.ts)
const CURRENCY_OPTIONS: Currency[] = ['none', 'eur', 'gbp', 'usd']

// nothing here is gated on wallet state at the page level - each card below
// carries its own Show where it actually matters (Download/Upgrade need
// unlocked, Forget needs a wallet at all, the rest work regardless), so this
// page shouldn't start requiring one either
const Settings: Component = () => {
  const {
    state,
    bearers,
    reloadBearers,
    refreshState,
    forgetWallet,
    unlock,
    encrypted,
    encryptionUpgraded,
    upgradeEncryption
  } = useWallet()
  const navigate = useNavigate()
  let fileRef: HTMLInputElement | undefined
  const [busy, setBusy] = createSignal(false)
  const [keyRestored, setKeyRestored] = createSignal(false)
  const [keySkipped, setKeySkipped] = createSignal(false)
  const [upgradeSeed, setUpgradeSeed] = createSignal('')
  const [upgradePassword, setUpgradePassword] = createSignal('')
  const [upgradeConfirmPassword, setUpgradeConfirmPassword] = createSignal('')
  const [upgrading, setUpgrading] = createSignal(false)
  const [confirmForget, setConfirmForget] = createSignal(false)
  const [editingAddon, setEditingAddon] = createSignal<
    AddonManifest | 'new' | null
  >(null)
  const [addonDraft, setAddonDraft] = createSignal('')
  const [confirmDeleteAddon, setConfirmDeleteAddon] = createSignal<
    string | null
  >(null)
  // which addon's info/settings dialog is open, by id - null for neither.
  // Separate signals since a holder could reasonably want to check an
  // addon's own settings without re-reading its blurb first, and closing
  // one should never also close the other.
  const [infoAddonId, setInfoAddonId] = createSignal<string | null>(null)
  const [settingsAddonId, setSettingsAddonId] = createSignal<string | null>(
    null
  )
  // three views onto the same addonDraft string - never a second copy of
  // the manifest, so there's nothing for the views to fall out of sync over
  const [editorMode, setEditorMode] = createSignal<'json' | 'form' | 'visual'>(
    'json'
  )

  const startNewAddon = () => {
    setAddonDraft(STARTER_TEMPLATE)
    setEditingAddon('new')
    setEditorMode('json')
  }

  const startEditAddon = (manifest: AddonManifest) => {
    setAddonDraft(JSON.stringify(manifest, null, 2))
    setEditingAddon(manifest)
    setEditorMode('json')
  }

  const cancelEditAddon = () => {
    setEditingAddon(null)
    setAddonDraft('')
  }

  // the form view's only source of truth is addonDraft itself, reparsed on
  // every read - editing a field patches the JSON string directly rather
  // than keeping a second, form-only copy of the manifest that could drift
  const parsedDraft = (): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(addonDraft())
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }

  const patchDraft = (patch: Record<string, unknown>) => {
    setAddonDraft(JSON.stringify({...(parsedDraft() ?? {}), ...patch}, null, 2))
  }

  const switchEditorMode = (mode: 'json' | 'form' | 'visual') => {
    if (mode === 'form' && parsedDraft() === null) {
      notify(
        'Fix the JSON before switching to the form view.',
        NotifyKind.ERROR
      )
      return
    }
    if (
      mode === 'visual' &&
      (parsedDraft() === null || !isSafeUiNode(parsedDraft()?.ui))
    ) {
      notify(
        'Fix the JSON before switching to the visual view.',
        NotifyKind.ERROR
      )
      return
    }
    setEditorMode(mode)
  }

  const draftPermissions = (): Permission[] => {
    const perms = parsedDraft()?.permissions
    return Array.isArray(perms) ? (perms as Permission[]) : []
  }

  const setDraftPermissions = (perms: Permission[]) =>
    patchDraft({permissions: perms})

  const updatePermission = (index: number, patch: Partial<Permission>) =>
    setDraftPermissions(
      draftPermissions().map((p, i) => (i === index ? {...p, ...patch} : p))
    )

  const addPermission = () =>
    setDraftPermissions([...draftPermissions(), {verb: '', reason: ''}])

  const removePermission = (index: number) =>
    setDraftPermissions(draftPermissions().filter((_, i) => i !== index))

  const draftNav = (): AddonNavEntry | undefined =>
    parsedDraft()?.nav as AddonNavEntry | undefined

  const setDraftNav = (nav: AddonNavEntry | undefined) => {
    const current = {...(parsedDraft() ?? {})}
    if (nav === undefined) delete current.nav
    else current.nav = nav
    setAddonDraft(JSON.stringify(current, null, 2))
  }

  const saveAddon = () => {
    try {
      const parsed: unknown = JSON.parse(addonDraft())
      const manifest = validateManifest(parsed)
      if (isBundledAddon(manifest.id)) {
        throw new Error(
          `"${manifest.id}" is a built-in addon id and can't be used for a custom one - pick a different id.`
        )
      }
      const wasEditing = editingAddon()
      if (wasEditing !== 'new' && wasEditing && wasEditing.id !== manifest.id) {
        // renamed id on an existing custom addon - the old entry would
        // otherwise linger alongside the new one under a different key
        deleteCustomAddon(wasEditing.id)
      }
      saveCustomAddon(manifest)
      notify(`Saved "${manifest.name}".`, NotifyKind.SUCCESS)
      cancelEditAddon()
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    }
  }

  const runUpgrade = async () => {
    if (!isValidSeedPhrase(upgradeSeed())) {
      notify('Das sind keine gültigen zwölf Wörter.', NotifyKind.ERROR)
      return
    }
    if (encrypted() && upgradePassword().length < MIN_PASSWORD_LENGTH) {
      notify(
        `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`,
        NotifyKind.ERROR
      )
      return
    }
    if (encrypted() && upgradePassword() !== upgradeConfirmPassword()) {
      notify('Die Passwörter stimmen nicht überein.', NotifyKind.ERROR)
      return
    }
    setUpgrading(true)
    try {
      await upgradeEncryption(
        upgradeSeed().trim().toLowerCase(),
        encrypted() ? upgradePassword() : undefined
      )
      setUpgradeSeed('')
      setUpgradePassword('')
      setUpgradeConfirmPassword('')
      notify(
        'Verschlüsselung erneuert.',
        NotifyKind.SUCCESS
      )
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setUpgrading(false)
    }
  }

  const download = () => {
    downloadBackupFile()
    notify('Sicherung heruntergeladen.', NotifyKind.SUCCESS)
  }

  const restore = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setBusy(true)
    setKeySkipped(false)
    setKeyRestored(false)
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error('Diese Datei ist viel zu groß für eine Wallet-Sicherung.')
      }
      const data = JSON.parse(await file.text())
      const result = applyBackup(data)
      if (state() === 'unlocked') await reloadBearers()
      if (result.linkingKeyRestored) {
        // never activated automatically, whatever its storage form: whoever
        // wrote the file necessarily had the key (encrypted or not), so the
        // restore pauses on the source-trust warning below instead
        setKeyRestored(true)
        refreshState()
      }
      if (result.linkingKeySkipped) setKeySkipped(true)
      notify(
        `${result.added} Scheine eingespielt, ${result.skipped} übersprungen` +
          (result.trustedMintsAdded > 0
            ? `, ${result.trustedMintsAdded} Ausgabestellen dazu.`
            : '.') +
          (result.linkingKeySkipped
            ? ' Hier gibt es schon eine Wallet — siehe Hinweis unten.'
            : '') +
          (result.linkingKeyRestored
            ? ' Der Schlüssel aus der Sicherung ist eingespielt — lies vorher den Hinweis unten.'
            : ''),
        result.linkingKeySkipped || result.linkingKeyRestored
          ? NotifyKind.ERROR
          : NotifyKind.SUCCESS
      )
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setBusy(false)
    }
  }

  // the user has acknowledged the source-trust warning for a
  // plaintext-stored backup key - activate it (an encrypted one instead
  // just gets pointed at the unlock screen, see below)
  const activateRestoredKey = async () => {
    try {
      await unlock()
      setKeyRestored(false)
      notify('Wallet wiederhergestellt.', NotifyKind.SUCCESS)
      navigate('/wallet')
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    }
  }

  const doForget = () => {
    forgetWallet()
    setConfirmForget(false)
    notify(
      'Wallet von diesem Gerät gelöscht.',
      NotifyKind.SUCCESS
    )
    navigate('/')
  }

  // Fork: aus dem Bedienfeld kommt man mit ?teil=… direkt zum gemeinten Abschnitt
  const [suche] = useSearchParams()
  onMount(() => {
    const teil = suche.teil
    if (typeof teil === 'string') document.getElementById(teil)?.scrollIntoView({block: 'start'})
  })

  return (
    <div id="settings" class="page">
      {/* Fork: die Einstellungen selbst sind jetzt das Bedienfeld (roehren/Einstellungen.tsx);
          hier bleibt das Original als „Erweitert“, erreichbar über dessen Zeilen */}
      <div class="rz-seitenkopf">
        <A href="/settings" class="rz-zurueck" aria-label="Zurück zu den Einstellungen">
          ‹
        </A>
        <h2>Erweitert</h2>
      </div>
      <div class="two-columns">
        <div class="two-col">
          <div class="setup-card">
            <h4>
              <IoTimeSharp />
              &nbsp;Automatisch sperren
            </h4>
            <p>
              Sperrt die Wallet, wenn so lange nichts passiert — mit einer Warnung 30 Sekunden vorher.
              <Show when={!encrypted()}>
                {' '}
                Wirkt erst, wenn die Wallet ein Passwort hat — ohne Passwort würde sie sich sowieso gleich wieder entsperren.
              </Show>
            </p>
            <div class="btns">
              <For each={AUTO_LOCK_OPTIONS}>
                {option => (
                  <button
                    type="button"
                    classList={{active: autoLockMinutes() === option}}
                    onClick={() => setAutoLockMinutes(option)}
                  >
                    {AUTO_LOCK_LABEL[option]}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="setup-card">
            <h4>
              <IoSearchSharp />
              &nbsp;Suchtiefe beim Wiederherstellen
            </h4>
            <p>
              Wie viele leere Stellen hintereinander die Wallet bei einer Ausgabestelle prüft, bevor sie aufhört, nach eigenen Scheinen zu suchen (beim Wiederherstellen aus den zwölf Wörtern). Höher findet mehr, braucht aber mehr Anfragen; niedriger ist schneller, kann aber einen Schein übersehen.
            </p>
            <div class="btns">
              <For each={GAP_LIMIT_OPTIONS}>
                {option => (
                  <button
                    type="button"
                    classList={{active: gapLimit() === option}}
                    onClick={() => setGapLimit(option)}
                  >
                    {GAP_LIMIT_LABEL[option]}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="setup-card">
            <h4>
              <IoCashSharp />
              &nbsp;Währung
            </h4>
            <p>
              Zeigt neben den Sats einen ungefähren Betrag in Landeswährung (Kurs von price.lnbits.com). Nur zur Anzeige — gehalten und bewegt wird immer in Sats.
            </p>
            <div class="btns">
              <For each={CURRENCY_OPTIONS}>
                {option => (
                  <button
                    type="button"
                    classList={{active: currency() === option}}
                    onClick={() => setCurrency(option)}
                  >
                    {option === 'none' ? 'Aus' : CURRENCY_LABEL[option]}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="setup-card">
            <h4>
              <IoCloudOfflineSharp />
              &nbsp;Offline-Betrieb
            </h4>
            <p>
              Die Wallet spricht mit keiner Ausgabestelle mehr: kein Senden, Teilen, Zusammenlegen oder Bezahlen. Deine Scheine bleiben sichtbar; erst wenn du das wieder ausschaltest, geht etwas ins Netz.
            </p>
            <div class="btns">
              <button
                type="button"
                classList={{active: offlineMode()}}
                onClick={() => setOfflineMode(!offlineMode())}
              >
                <IoCloudOfflineSharp />
                &nbsp;
                <Show when={offlineMode()} fallback="Einschalten">
                  Ausschalten
                </Show>
              </button>
            </div>
          </div>
          <div class="setup-card">
            <h4>
              <IoHardwareChipSharp />
              &nbsp;Vault (alpha)
            </h4>
            <p>
              Pairing + read-only visibility for an LNURLvault hardware device
              (USB/Bluetooth) - still alpha, off by default. Turning this on
              adds a "Vault" link to the nav bar.
            </p>
            <div class="btns">
              <button
                type="button"
                classList={{active: vaultEnabled()}}
                onClick={() => setVaultEnabled(!vaultEnabled())}
              >
                <IoHardwareChipSharp />
                &nbsp;
                <Show when={vaultEnabled()} fallback="Einschalten">
                  Ausschalten
                </Show>
              </button>
            </div>
          </div>
          <Show when={state() === 'unlocked'}>
            <div class="setup-card">
              <h4>
                <IoDownloadSharp />
                &nbsp;Sicherung herunterladen
              </h4>
              <p>
                Eine Datei mit deinen {bearers().length} Scheinen (verschlüsselt, nie im Klartext) und {trustedMints().length} vertrauten Ausgabestellen.
                <Show
                  when={encrypted()}
                  fallback={
                    <>
                      {' '}
                      Deine Wallet hat kein Passwort, deshalb ist dein Schlüssel{' '} <strong>nicht</strong> dabei — auf einem anderen Gerät brauchst du zusätzlich deine zwölf Wörter.
                    </>
                  }
                >
                  {' '}
                  Dein mit Passwort verschlüsselter Schlüssel ist dabei — auf einem neuen Gerät reichen diese Datei und dein Passwort.
                </Show>
              </p>
              <div class="btns">
                <button onClick={download}>
                  <IoDownloadSharp />
                  &nbsp;Sicherung herunterladen
                </button>
              </div>
            </div>
          </Show>
          <Show when={state() === 'unlocked' && !encryptionUpgraded()}>
            <div class="setup-card" id="verschluesselung">
              <h4>Verschlüsselung erneuern</h4>
              <p>
                Deine Scheine sind noch mit einem Schlüssel aus einer älteren Fassung verschlüsselt. Gibst du hier deine zwölf Wörter ein, verschlüsselt die Wallet alle Scheine und den Verlauf mit einem einfacher abgeleiteten Schlüssel neu. Deine Wörter und deine Scheine bleiben dieselben.
              </p>
              <label>Deine zwölf Wörter</label>
              <textarea
                rows="3"
                placeholder="zwölf Wörter, mit Leerzeichen getrennt"
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={upgradeSeed()}
                onInput={e => setUpgradeSeed(e.currentTarget.value)}
              />
              <Show when={encrypted()}>
                <input
                  type="password"
                  placeholder="Passwort für den neuen Schlüssel"
                  autocomplete="new-password"
                  autocapitalize="off"
                  spellcheck={false}
                  value={upgradePassword()}
                  onInput={e => setUpgradePassword(e.currentTarget.value)}
                />
                <input
                  type="password"
                  placeholder="Passwort wiederholen"
                  autocomplete="new-password"
                  autocapitalize="off"
                  spellcheck={false}
                  value={upgradeConfirmPassword()}
                  onInput={e =>
                    setUpgradeConfirmPassword(e.currentTarget.value)
                  }
                />
              </Show>
              <div class="btns">
                <button
                  disabled={upgrading() || !upgradeSeed().trim()}
                  onClick={runUpgrade}
                >
                  <Show
                    when={upgrading()}
                    fallback={<IoShieldCheckmarkSharp />}
                  >
                    <IoRefreshSharp class="spin" />
                  </Show>
                  &nbsp;Verschlüsselung erneuern
                </button>
              </div>
            </div>
          </Show>
          <div class="setup-card" id="einspielen">
            <h4>
              <IoFolderOpenSharp />
              &nbsp;Sicherung einspielen
            </h4>
            <p>
              Die Scheine aus der Datei kommen dazu (doppelte werden übersprungen), lesbar sind sie aber nur mit dem Schlüssel, mit dem sie verschlüsselt wurden.{' '} <strong>Die Reihenfolge zählt</strong>: zuerst die Wallet mit deinen zwölf Wörtern{' '} <A href="/setup">wiederherstellen</A> — oder die Datei auf einem Gerät ohne Wallet einspielen, wenn sie den Schlüssel mitbringt. Legst du hier zuerst eine neue Wallet an, sind die Scheine danach da, aber nicht lesbar.
            </p>
            <Show when={state() === 'none'}>
              <p>
                Hier gibt es noch keine Wallet: Bringt die Sicherung ihren Schlüssel mit, entsteht sie von selbst; sonst zuerst mit den zwölf Wörtern wiederherstellen.
              </p>
            </Show>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style="display: none"
              onChange={restore}
            />
            <div class="btns">
              <button disabled={busy()} onClick={() => fileRef?.click()}>
                <Show when={busy()} fallback={<IoFolderOpenSharp />}>
                  <IoRefreshSharp class="spin" />
                </Show>
                &nbsp;Sicherungsdatei wählen
              </button>
            </div>
            <Show when={keyRestored()}>
              <p class="warning">
                Der Schlüssel aus dieser Sicherung ist jetzt eingespielt. Wer die Datei erstellt hat, kann ihn kennen — mach nur weiter, wenn du ihr vertraust; sonst vergiss diese Wallet unten und richte sie mit deinen eigenen zwölf Wörtern neu ein.
              </p>
              <Show
                when={encrypted()}
                fallback={
                  <>
                    <p class="warning">
                      Dieser Schlüssel hatte kein Passwort und liegt jetzt unverschlüsselt hier. Bestätige, bevor du ihn verwendest:
                    </p>
                    <div class="btns">
                      <button onClick={activateRestoredKey}>
                        Ich vertraue der Datei — Wallet verwenden
                      </button>
                    </div>
                  </>
                }
              >
                <p class="warning">
                  <A href="/wallet">Entsperre die Wallet</A> mit dem Passwort, das zur Sicherung gehört.
                </p>
              </Show>
            </Show>
            <Show when={keySkipped()}>
              <p class="warning">
                Auf diesem Gerät gibt es schon eine Wallet, deshalb wurde der Schlüssel aus der Sicherung nicht übernommen — ihre Scheine erscheinen hier nicht. Ist das nicht die richtige Wallet, vergiss sie unten (gefahrlos, wenn sie leer ist) und spiel die Datei danach noch einmal ein.
              </p>
            </Show>
          </div>
          <Show when={state() !== 'none'}>
            <div class="setup-card">
              <h4>
                <IoTrashSharp />
                &nbsp;Wallet von diesem Gerät löschen
              </h4>
              <p class="warning">
                Entfernt <strong>alles</strong> von diesem Gerät: Schlüssel, Scheine, Ausgabestellen. Die zwölf Wörter bringen die Scheine nicht zurück — nur eine vorher heruntergeladene Sicherung.
              </p>
              <div class="btns">
                <button onClick={download}>
                  <IoDownloadSharp />
                  &nbsp;Zuerst Sicherung herunterladen
                </button>
              </div>
              <Show
                when={confirmForget()}
                fallback={
                  <div class="btns">
                    <button onClick={() => setConfirmForget(true)}>
                      <IoTrashSharp />
                      &nbsp;Wallet löschen
                    </button>
                  </div>
                }
              >
                <p class="warning">
                  Wirklich? Schlüssel und alle Scheine verschwinden von diesem Gerät — zurück bringt sie nur eine vorher heruntergeladene Sicherung.
                </p>
                <div class="btns">
                  <button onClick={doForget}>Ja, alles löschen</button>
                  <button onClick={() => setConfirmForget(false)}>
                    Abbrechen
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
        <div class="two-col" id="extras">
          <h3>Addons</h3>
          <p>
            Optional features, off by default. Each one only gets the
            capabilities listed under its own name button below - nothing else.
            See{' '}
            <a
              href="https://github.com/lnurlcash/lnurl-wallet/blob/main/src/addons/README.md"
              target="_blank"
              rel="noreferrer"
            >
              src/addons/README.md
            </a>{' '}
            for how the addon system itself works, and what a custom addon's
            manifest JSON can and can't do.
          </p>

          <button
            type="button"
            class="icon-btn"
            classList={{active: experimentalAddonsVisible()}}
            title={
              experimentalAddonsVisible()
                ? 'Hide experimental addons (still under active development/review) again'
                : 'Show experimental addons (still under active development/review) too'
            }
            onClick={() =>
              setExperimentalAddonsVisible(!experimentalAddonsVisible())
            }
          >
            <IoFlaskSharp />
            &nbsp;Experimental addons
          </button>

          <div class="addon-list">
            <For each={allAddons()}>
              {addon => {
                const enabled = () => enabledAddonIds().has(addon.manifest.id)
                const custom = () => isCustomAddon(addon.manifest.id)
                const Icon = ADDON_ICONS[addon.manifest.icon]
                // an experimental addon this holder already turned on stays
                // visible even with the toggle above off - hiding it would
                // leave no way back to turn it off again
                const visible = () =>
                  !addon.manifest.experimental ||
                  experimentalAddonsVisible() ||
                  enabled()
                return (
                  <Show when={visible()}>
                    <span class="mint-picker-entry">
                      <button
                        type="button"
                        class="icon-btn"
                        classList={{active: enabled()}}
                        title={enabled() ? 'Turn off' : 'Turn on'}
                        onClick={() =>
                          setAddonEnabled(addon.manifest.id, !enabled())
                        }
                      >
                        <IoPowerSharp />
                      </button>
                      <button
                        type="button"
                        title={
                          addon.manifest.description || addon.manifest.name
                        }
                        onClick={() => setInfoAddonId(addon.manifest.id)}
                      >
                        {Icon && <Icon />}
                        &nbsp;{addon.manifest.name}
                        <Show when={addon.manifest.experimental}>
                          &nbsp;
                          <IoFlaskSharp title="Experimental" />
                        </Show>
                        <Show when={custom()}>&nbsp;(custom)</Show>
                      </button>
                      <Show when={enabled()}>
                        <A
                          href={
                            addon.manifest.nav?.route ??
                            `/addons/${addon.manifest.id}`
                          }
                          class="icon-btn"
                          title="Open this addon"
                        >
                          <IoOpenSharp />
                        </A>
                      </Show>
                      <Show
                        when={
                          enabled() &&
                          (addon.manifest.settings || addon.manifest.nav)
                        }
                      >
                        <button
                          type="button"
                          class="icon-btn"
                          title="Addon settings"
                          onClick={() => setSettingsAddonId(addon.manifest.id)}
                        >
                          <IoCogSharp />
                        </button>
                      </Show>
                      <Show when={custom()}>
                        <button
                          type="button"
                          class="icon-btn"
                          title="Edit this addon's manifest"
                          onClick={() => startEditAddon(addon.manifest)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          class="icon-btn"
                          title="Delete this addon"
                          onClick={() =>
                            setConfirmDeleteAddon(addon.manifest.id)
                          }
                        >
                          <IoTrashSharp />
                        </button>
                      </Show>
                    </span>
                  </Show>
                )
              }}
            </For>
          </div>

          {/* keyed: these all gate on an addon id that can change from one
          truthy value straight to another (clicking a different addon's
          Info/Settings/Delete without closing the previous one first) - a
          non-keyed Show only re-runs its children on a truthy/falsy flip
          (see AddonRun.tsx's own fix for this exact bug), which would leave
          the PREVIOUS addon's dialog content on screen under the new id */}
          <Show when={confirmDeleteAddon()} keyed>
            {id => {
              const target = () => allAddons().find(a => a.manifest.id === id)
              return (
                <div class="setup-card">
                  <p class="warning">
                    Delete "{target()?.manifest.name}"? Notes it already created
                    keep their tags either way - this only removes the addon
                    itself.
                  </p>
                  <div class="btns">
                    <button
                      type="button"
                      onClick={() => {
                        deleteCustomAddon(id)
                        setAddonEnabled(id, false)
                        setConfirmDeleteAddon(null)
                        notify('Addon deleted.', NotifyKind.SUCCESS)
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAddon(null)}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )
            }}
          </Show>

          <Show when={infoAddonId()} keyed>
            {id => (
              <Show when={allAddons().find(a => a.manifest.id === id)} keyed>
                {found => {
                  const Icon = ADDON_ICONS[found.manifest.icon]
                  return (
                    <Dialog onClose={() => setInfoAddonId(null)}>
                      <h4>
                        {Icon && <Icon />}
                        &nbsp;{found.manifest.name}
                        <Show when={isCustomAddon(found.manifest.id)}>
                          <span class="bearer-pending">&nbsp;custom</span>
                        </Show>
                      </h4>
                      <p class="bearer-label">
                        v{found.manifest.version}
                        {isBundledAddon(found.manifest.id)
                          ? ' - bundled'
                          : ' - custom'}
                      </p>
                      <Show when={found.manifest.description}>
                        <p>{found.manifest.description}</p>
                      </Show>
                      <p class="bearer-label">Can:</p>
                      <Show
                        when={found.manifest.permissions.length > 0}
                        fallback={
                          <p>Nothing beyond reading its own settings.</p>
                        }
                      >
                        <ul>
                          <For each={found.manifest.permissions}>
                            {perm => <li>{perm.reason}</li>}
                          </For>
                        </ul>
                      </Show>
                    </Dialog>
                  )
                }}
              </Show>
            )}
          </Show>

          {/* this addon's own settings.ui - see addons/Renderer.tsx's
          'settings' mode, which never wires up a verb dispatcher at all, so
          nothing rendered here can touch a note. Also where the nav
          position toggle (Left/Right in the wallet's own nav bar) lives now
          - moved in from the addon-list row above, since it's wallet-level
          placement, not something the addon's own manifest.settings.ui
          renders - this dialog opens for that alone even when an addon
          declares no settings.ui of its own (see the row's own Show gate:
          `addon.manifest.settings || addon.manifest.nav`) */}
          <Show when={settingsAddonId()} keyed>
            {id => (
              <Show when={allAddons().find(a => a.manifest.id === id)} keyed>
                {found => (
                  <Dialog onClose={() => setSettingsAddonId(null)}>
                    <h4>{found.manifest.name} settings</h4>
                    <Show when={found.manifest.nav}>
                      <p class="bearer-label">Nav position</p>
                      <div class="btns">
                        <button
                          type="button"
                          classList={{
                            active: effectiveNavPosition(found) === 'left'
                          }}
                          onClick={() =>
                            setAddonNavPosition(found.manifest.id, 'left')
                          }
                        >
                          Left (alongside Wallet/Mint/Vault)
                        </button>
                        <button
                          type="button"
                          classList={{
                            active: effectiveNavPosition(found) === 'right'
                          }}
                          onClick={() =>
                            setAddonNavPosition(found.manifest.id, 'right')
                          }
                        >
                          Right (alongside Docs/Settings)
                        </button>
                      </div>
                    </Show>
                    <Show when={found.manifest.settings}>
                      <AddonRenderer
                        addon={found}
                        mode="settings"
                        settingsStore={addonSettingsStore(
                          found.manifest.id,
                          found.manifest.settings!.state
                        )}
                      />
                    </Show>
                  </Dialog>
                )}
              </Show>
            )}
          </Show>

          <div class="setup-card">
            <h4>Build your own addon</h4>
            <p>
              A custom addon is JSON, not code - the same rendered-by-this-app
              format described in the README linked above, restricted to the
              same fixed set of components/verbs every addon gets. Nobody
              reviews this but you.
            </p>
            <div class="btns">
              <button type="button" onClick={startNewAddon}>
                + New custom addon
              </button>
            </div>
          </div>

          <Show when={editingAddon()}>
            <Dialog onClose={cancelEditAddon}>
              <h4>
                {editingAddon() === 'new'
                  ? 'New custom addon'
                  : `Edit "${(editingAddon() as AddonManifest).name}"`}
              </h4>
              <div class="btns">
                <button
                  type="button"
                  classList={{active: editorMode() === 'form'}}
                  onClick={() => switchEditorMode('form')}
                >
                  Form
                </button>
                <button
                  type="button"
                  classList={{active: editorMode() === 'json'}}
                  onClick={() => switchEditorMode('json')}
                >
                  Raw JSON
                </button>
                <button
                  type="button"
                  classList={{active: editorMode() === 'visual'}}
                  onClick={() => switchEditorMode('visual')}
                >
                  Visual
                </button>
              </div>
              <Switch
                fallback={
                  <>
                    <p class="bearer-label">Manifest JSON</p>
                    <textarea
                      class="addon-builder-textarea"
                      value={addonDraft()}
                      onInput={e => setAddonDraft(e.currentTarget.value)}
                      spellcheck={false}
                      rows={20}
                    />
                  </>
                }
              >
                <Match when={editorMode() === 'visual'}>
                  <p class="addon-form-note">
                    Editing the "ui" tree only - state, settings.* and the other
                    manifest fields stay on Form/Raw JSON.
                  </p>
                  <UiBuilder
                    ui={(parsedDraft()?.ui as UiNode) ?? defaultNodeFor('View')}
                    onChange={next => patchDraft({ui: next})}
                  />
                </Match>
                <Match when={editorMode() === 'form'}>
                  <div class="addon-form">
                    <label>Id</label>
                    <input
                      type="text"
                      value={(parsedDraft()?.id as string) ?? ''}
                      onInput={e => patchDraft({id: e.currentTarget.value})}
                    />
                    <label>Name</label>
                    <input
                      type="text"
                      value={(parsedDraft()?.name as string) ?? ''}
                      onInput={e => patchDraft({name: e.currentTarget.value})}
                    />
                    <label>Version</label>
                    <input
                      type="text"
                      value={(parsedDraft()?.version as string) ?? ''}
                      onInput={e =>
                        patchDraft({version: e.currentTarget.value})
                      }
                    />
                    <label>Icon</label>
                    <select
                      value={(parsedDraft()?.icon as string) ?? ''}
                      onChange={e => patchDraft({icon: e.currentTarget.value})}
                    >
                      <For each={Object.keys(ADDON_ICONS)}>
                        {name => <option value={name}>{name}</option>}
                      </For>
                    </select>
                    <label>Description</label>
                    <input
                      type="text"
                      value={(parsedDraft()?.description as string) ?? ''}
                      onInput={e =>
                        patchDraft({description: e.currentTarget.value})
                      }
                    />

                    <p class="bearer-label">Permissions</p>
                    <For each={draftPermissions()}>
                      {(perm, i) => (
                        <div class="addon-form-permission">
                          <label>Verb</label>
                          <input
                            type="text"
                            value={perm.verb}
                            onInput={e =>
                              updatePermission(i(), {
                                verb: e.currentTarget.value
                              })
                            }
                          />
                          <label>Reason (shown to the holder)</label>
                          <input
                            type="text"
                            value={perm.reason}
                            onInput={e =>
                              updatePermission(i(), {
                                reason: e.currentTarget.value
                              })
                            }
                          />
                          <label>Scope (optional)</label>
                          <input
                            type="text"
                            value={perm.scope ?? ''}
                            onInput={e =>
                              updatePermission(i(), {
                                scope: e.currentTarget.value || undefined
                              })
                            }
                          />
                          <div class="btns">
                            <button
                              type="button"
                              class="icon-btn"
                              onClick={() => removePermission(i())}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </For>
                    <div class="btns">
                      <button type="button" onClick={addPermission}>
                        + Add permission
                      </button>
                    </div>

                    <p class="bearer-label">Navigation link</p>
                    <div class="btns">
                      <button
                        type="button"
                        classList={{active: draftNav() !== undefined}}
                        onClick={() =>
                          setDraftNav(
                            draftNav() !== undefined
                              ? undefined
                              : {
                                  position: 'left',
                                  label: '',
                                  icon: Object.keys(ADDON_ICONS)[0] ?? ''
                                }
                          )
                        }
                      >
                        <Show when={draftNav() !== undefined} fallback="Add">
                          Remove
                        </Show>
                      </button>
                    </div>
                    <Show when={draftNav()}>
                      {nav => (
                        <>
                          <label>Position</label>
                          <div class="btns">
                            <button
                              type="button"
                              classList={{active: nav().position === 'left'}}
                              onClick={() =>
                                setDraftNav({...nav(), position: 'left'})
                              }
                            >
                              Left (Wallet/Mint/Vault)
                            </button>
                            <button
                              type="button"
                              classList={{active: nav().position === 'right'}}
                              onClick={() =>
                                setDraftNav({...nav(), position: 'right'})
                              }
                            >
                              Right (Docs/Activity/Settings)
                            </button>
                          </div>
                          <label>Label</label>
                          <input
                            type="text"
                            value={nav().label}
                            onInput={e =>
                              setDraftNav({
                                ...nav(),
                                label: e.currentTarget.value
                              })
                            }
                          />
                          <label>Icon</label>
                          <select
                            value={nav().icon}
                            onChange={e =>
                              setDraftNav({
                                ...nav(),
                                icon: e.currentTarget.value
                              })
                            }
                          >
                            <For each={Object.keys(ADDON_ICONS)}>
                              {name => <option value={name}>{name}</option>}
                            </For>
                          </select>
                          <label>
                            Route (optional - defaults to /addons/&lt;id&gt;)
                          </label>
                          <input
                            type="text"
                            value={nav().route ?? ''}
                            onInput={e =>
                              setDraftNav({
                                ...nav(),
                                route: e.currentTarget.value || undefined
                              })
                            }
                          />
                        </>
                      )}
                    </Show>

                    <p class="bearer-label addon-form-note">
                      state and settings.* aren't editable here - use Raw JSON
                      for those. ui has its own Visual tab above.
                    </p>
                  </div>
                </Match>
              </Switch>
              <div class="btns">
                <button type="button" onClick={saveAddon}>
                  Save
                </button>
                <button type="button" onClick={cancelEditAddon}>
                  Abbrechen
                </button>
              </div>
            </Dialog>
          </Show>
        </div>
      </div>
    </div>
  )
}
export default Settings
