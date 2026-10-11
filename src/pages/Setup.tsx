import type {Component} from 'solid-js'
import {Show, For, createSignal} from 'solid-js'
import {A, useNavigate, useSearchParams} from '@solidjs/router'
import {IoRefreshSharp, IoSearchSharp, IoTrashSharp} from 'solid-icons/io'

import {useWallet} from '../WalletContext'
import {generateSeedPhrase, isValidSeedPhrase} from '../keys'
import {notify, NotifyKind, msatToSats} from '../helpers'
import {resolveMintInput} from '../lnurlcash'
import {PUBLIC_MINTS} from '../trustedMints'
import {scanMintForNotes} from '../recovery'
import {gapLimit} from '../gapLimit'
import {
  mergeCashAddressSecretIndices,
  mergeCashChangeSecretIndices
} from '../cashSecrets'

type Tab = 'create' | 'restore'

// the linking key's ciphertext sits in localStorage AND travels inside
// every backup file by design, so this password is the only thing between
// an offline brute-force and every note the wallet holds - a one-character
// password is no password at all
export const MIN_PASSWORD_LENGTH = 8

const Setup: Component = () => {
  const {setup, state} = useWallet()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = createSignal<Tab>(
    searchParams.tab === 'restore' ? 'restore' : 'create'
  )
  const [seedPhrase, setSeedPhrase] = createSignal<string | null>(null)
  const [restorePhrase, setRestorePhrase] = createSignal('')
  const [confirmed, setConfirmed] = createSignal(false)
  // encrypting the linking key is the default - opting out is possible but
  // means anyone with access to this browser profile can read the wallet
  const [encrypt, setEncrypt] = createSignal(true)
  const [setupPassword, setSetupPassword] = createSignal('')
  const [confirmPassword, setConfirmPassword] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  // set once a seed restore succeeds (never for "create new" - a fresh
  // seed has nothing to recover) - holds on the recovery step (see
  // MintRecovery below) instead of navigating straight to /wallet
  const [showRecovery, setShowRecovery] = createSignal(false)

  const generate = () => {
    setSeedPhrase(generateSeedPhrase())
    setConfirmed(false)
  }

  const passwordOk = () =>
    !encrypt() ||
    (setupPassword().length >= MIN_PASSWORD_LENGTH &&
      setupPassword() === confirmPassword())

  const finishSetup = async (phrase: string) => {
    if (encrypt() && setupPassword().length < MIN_PASSWORD_LENGTH) {
      notify(
        `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`,
        NotifyKind.ERROR
      )
      return
    }
    if (encrypt() && setupPassword() !== confirmPassword()) {
      notify('Die Passwörter stimmen nicht überein.', NotifyKind.ERROR)
      return
    }
    setBusy(true)
    try {
      await setup(
        phrase,
        encrypt() ? setupPassword() : undefined,
        tab() === 'create'
      )
      notify('Wallet bereit.', NotifyKind.SUCCESS)
      // a restored seed may have notes at mints this device doesn't know
      // about yet - offer to scan for them before landing in an empty
      // wallet. A freshly generated seed has nothing to recover, so
      // "create new" skips straight to /wallet as before.
      if (tab() === 'restore') {
        setShowRecovery(true)
      } else {
        navigate('/wallet')
      }
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    if (!isValidSeedPhrase(restorePhrase())) {
      notify('Das sind keine gültigen zwölf Wörter (BIP39).', NotifyKind.ERROR)
      return
    }
    await finishSetup(restorePhrase().trim().toLowerCase())
  }

  return (
    <Show
      when={!showRecovery()}
      fallback={<MintRecovery onDone={() => navigate('/wallet')} />}
    >
      <div id="setup" class="page">
        <h2>Wallet einrichten</h2>
        <Show when={state() !== 'none'}>
          <p class="warning">
            Auf diesem Gerät gibt es schon eine Wallet – eine neue ersetzt ihren Schlüssel. Mit dem alten Schlüssel verschlüsselte Scheine bleiben gespeichert, sind aber unlesbar, bis die alten zwölf Wörter wieder eingespielt werden.
          </p>
        </Show>
        <div class="tabs">
          <button
            classList={{active: tab() === 'create'}}
            onClick={() => setTab('create')}
          >
            Neu anlegen
          </button>
          <button
            classList={{active: tab() === 'restore'}}
            onClick={() => setTab('restore')}
          >
            Mit zwölf Wörtern wiederherstellen
          </button>
        </div>
        <div class="setup-card">
          <Show when={tab() === 'create'}>
            <Show
              when={seedPhrase()}
              fallback={
                <>
                  <p>
                    Im Browser entstehen zwölf neue Wörter – sie sind der Hauptschlüssel deiner Wallet und der einzige Weg, deine Scheine auf einem anderen Gerät wiederherzustellen.
                  </p>
                  <div class="btns">
                    <button onClick={generate}>Zwölf Wörter erzeugen</button>
                  </div>
                </>
              }
            >
              <label>
                Deine zwölf Wörter – schreib sie auf, gespeichert werden sie nirgends:
              </label>
              <pre>{seedPhrase()}</pre>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed()}
                  onChange={e => setConfirmed(e.currentTarget.checked)}
                />
                &nbsp;Ich habe meine zwölf Wörter sicher aufbewahrt
              </label>
              <EncryptChoice
                encrypt={encrypt()}
                setEncrypt={setEncrypt}
                password={setupPassword()}
                setPassword={setSetupPassword}
                confirmPassword={confirmPassword()}
                setConfirmPassword={setConfirmPassword}
              />
              <div class="btns">
                <button
                  disabled={busy() || !confirmed() || !passwordOk()}
                  onClick={() => finishSetup(seedPhrase()!)}
                >
                  <Show when={busy()}>
                    <IoRefreshSharp class="spin" />
                    &nbsp;
                  </Show>
                  Weiter
                </button>
                <button onClick={() => setSeedPhrase(null)}>Abbrechen</button>
              </div>
            </Show>
          </Show>
          <Show when={tab() === 'restore'}>
            <label>Deine zwölf Wörter (BIP39)</label>
            <textarea
              rows="3"
              placeholder="zwölf Wörter, durch Leerzeichen getrennt"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              data-1p-ignore
              data-lpignore="true"
              value={restorePhrase()}
              onInput={e => setRestorePhrase(e.currentTarget.value)}
            />
            <EncryptChoice
              encrypt={encrypt()}
              setEncrypt={setEncrypt}
              password={setupPassword()}
              setPassword={setSetupPassword}
              confirmPassword={confirmPassword()}
              setConfirmPassword={setConfirmPassword}
            />
            <div class="btns">
              <button
                disabled={busy() || !restorePhrase().trim() || !passwordOk()}
                onClick={restore}
              >
                <Show when={busy()}>
                  <IoRefreshSharp class="spin" />
                  &nbsp;
                </Show>
                Wallet wiederherstellen
              </button>
            </div>
          </Show>
          <p>
            Wiederherstellen aus einer Sicherungsdatei – ohne die zwölf Wörter, solange du ihr Passwort kennst – geht in den{' '} <A href="/settings/erweitert?teil=einspielen">Einstellungen</A>.
          </p>
        </div>
      </div>
    </Show>
  )
}

const EncryptChoice: Component<{
  encrypt: boolean
  setEncrypt: (v: boolean) => void
  password: string
  setPassword: (v: string) => void
  confirmPassword: string
  setConfirmPassword: (v: string) => void
}> = props => (
  <>
    <label>
      <input
        type="checkbox"
        checked={props.encrypt}
        onChange={e => props.setEncrypt(e.currentTarget.checked)}
      />
      &nbsp;Schlüssel mit Passwort schützen (empfohlen)
    </label>
    <Show
      when={props.encrypt}
      fallback={
        <p class="warning">
          Ohne Passwort liegt der Schlüssel offen im Browser – wer dieses Browserprofil benutzt, kann deine Scheine ausgeben.
        </p>
      }
    >
      <input
        type="password"
        placeholder="Passwort für den Schlüssel"
        autocomplete="new-password"
        autocapitalize="off"
        spellcheck={false}
        value={props.password}
        onInput={e => props.setPassword(e.currentTarget.value)}
      />
      <input
        type="password"
        placeholder="Passwort wiederholen"
        autocomplete="new-password"
        autocapitalize="off"
        spellcheck={false}
        value={props.confirmPassword}
        onInput={e => props.setConfirmPassword(e.currentTarget.value)}
      />
      <Show
        when={
          props.password.length > 0 &&
          props.password.length < MIN_PASSWORD_LENGTH
        }
      >
        <p class="warning">
          Mindestens {MIN_PASSWORD_LENGTH} Zeichen – dieses Passwort ist das Einzige, was deine Scheine vor einem Durchprobieren schützt.
        </p>
      </Show>
      <Show
        when={props.confirmPassword && props.password !== props.confirmPassword}
      >
        <p class="warning">Die Passwörter stimmen nicht überein.</p>
      </Show>
    </Show>
  </>
)

// LUD-25 seed-recoverable notes (see recovery.ts): shown once right after a
// seed restore, since that's the one moment this wallet knows nothing about
// its own history yet - there's no way to discover which mints to scan from
// the seed alone, so the holder picks from the public list or types an
// address, same two ways Mint.tsx already offers for minting itself.
// "Skip" always works: this step never blocks reaching the wallet, and
// nothing here is a one-shot chance - the same seed can scan the same mint
// again later.
const MintRecovery: Component<{onDone: () => void}> = props => {
  const {bearers, addBearer, logActivity} = useWallet()
  const [selected, setSelected] = createSignal<string[]>([])
  const [customInput, setCustomInput] = createSignal('')
  const [customMints, setCustomMints] = createSignal<string[]>([])
  const [scanning, setScanning] = createSignal(false)
  const [results, setResults] = createSignal<
    Record<
      string,
      {
        status: 'scanning' | 'done' | 'error'
        index: number
        foundCount: number
        error?: string
      }
    >
  >({})

  const togglePublicMint = (mint: string) => {
    setSelected(prev =>
      prev.includes(mint) ? prev.filter(m => m !== mint) : [...prev, mint]
    )
  }

  const addCustomMint = () => {
    const value = customInput().trim()
    if (!value) return
    if (!resolveMintInput(value)) {
      notify('Keine erkennbare Adresse einer Ausgabestelle und kein LNURL.', NotifyKind.ERROR)
      return
    }
    if (!customMints().includes(value)) {
      setCustomMints(prev => [...prev, value])
    }
    setCustomInput('')
  }

  const removeCustomMint = (mint: string) => {
    setCustomMints(prev => prev.filter(m => m !== mint))
  }

  const mintsToScan = () => [...selected(), ...customMints()]

  const runScan = async () => {
    const mints = mintsToScan()
    if (mints.length === 0 || scanning()) return
    setScanning(true)
    setResults({})
    let totalFound = 0
    let totalMsat = 0
    try {
      for (const mint of mints) {
        setResults(prev => ({
          ...prev,
          [mint]: {status: 'scanning', index: 0, foundCount: 0}
        }))
        const result = await scanMintForNotes(
          mint,
          index => {
            setResults(prev => ({...prev, [mint]: {...prev[mint], index}}))
          },
          bearers()
        )
        for (const note of result.recovered) {
          await addBearer(note)
          logActivity(
            'recovered',
            `${msatToSats(note.amount)} Sats von ${result.server} beim Wiederherstellen gefunden.`
          )
        }
        if (result.highestUsedIndex !== null) {
          mergeCashAddressSecretIndices({
            [result.server]: result.highestUsedIndex + 1
          })
        }
        if (result.highestUsedChangeIndex !== null) {
          mergeCashChangeSecretIndices({
            [result.server]: result.highestUsedChangeIndex + 1
          })
        }
        totalFound += result.recovered.length
        totalMsat += result.recovered.reduce((sum, n) => sum + n.amount, 0)
        setResults(prev => ({
          ...prev,
          [mint]: {
            status: result.error ? 'error' : 'done',
            index: prev[mint]?.index ?? 0,
            foundCount: result.recovered.length,
            error: result.error
          }
        }))
      }
      notify(
        totalFound > 0
          ? `Recovered ${totalFound} note${totalFound === 1 ? '' : 's'} (${msatToSats(totalMsat)} sats).`
          : 'No recoverable notes found at the scanned mints.',
        NotifyKind.SUCCESS
      )
    } finally {
      setScanning(false)
    }
  }

  return (
    <div id="setup" class="page">
      <h2>Scheine wiederfinden</h2>
      <div class="setup-card">
        <p>
          Re-derives every key-path note key (LUD-25) this wallet would have
          generated at each mint below and checks which ones are still
          outstanding. This only finds notes minted, rotated, split or merged by
          a seed-aware version of this wallet - not ones simply received from
          someone else, not ones minted while offline or with an older version
          that predates this feature, and not a legacy hash-keyed note (those
          are plain randomness, never seed-derived, so there is nothing here to
          re-derive them from). Each mint is checked index by index until{' '}
          {gapLimit()} in a row turn up nothing, the same gap-limit convention
          HD wallets already use for address recovery (configurable under
          Settings &gt; Recovery scan gap limit). Pick every mint you remember
          using; nothing is lost by skipping one now, the same seed can scan it
          again later.
        </p>
        <label>Öffentliche Ausgabestellen</label>
        <div class="form-item">
          <For each={PUBLIC_MINTS}>
            {address => (
              <label class="recovery-mint-option">
                <input
                  type="checkbox"
                  checked={selected().includes(address)}
                  onChange={() => togglePublicMint(address)}
                />
                &nbsp;{address}
              </label>
            )}
          </For>
        </div>
        <label>Per Adresse hinzufügen</label>
        <div class="paste-input-row">
          <div class="paste-input-wrapper">
            <input
              type="text"
              placeholder="lnurl1... or mint@example.com"
              value={customInput()}
              onInput={e => setCustomInput(e.currentTarget.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomMint()}
            />
          </div>
          <button type="button" onClick={addCustomMint}>
            Hinzufügen
          </button>
        </div>
        <Show when={customMints().length > 0}>
          <div class="mint-picker">
            <For each={customMints()}>
              {mint => (
                <span class="mint-picker-entry">
                  {mint}
                  <button
                    type="button"
                    class="icon-btn"
                    title="Entfernen"
                    onClick={() => removeCustomMint(mint)}
                  >
                    <IoTrashSharp />
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
        <Show when={Object.keys(results()).length > 0}>
          <div class="form-item">
            <For each={mintsToScan()}>
              {mint => {
                const result = () => results()[mint]
                return (
                  <Show when={result()}>
                    {r => (
                      <p
                        class={
                          r().status === 'error' ? 'warning' : 'bearer-hint'
                        }
                      >
                        {mint}:{' '}
                        <Show when={r().status === 'scanning'}>
                          checking index {r().index}...
                        </Show>
                        <Show when={r().status === 'done'}>
                          {r().foundCount > 0
                            ? `${r().foundCount} note${r().foundCount === 1 ? '' : 's'} found`
                            : 'nothing found'}
                        </Show>
                        <Show when={r().status === 'error'}>{r().error}</Show>
                      </p>
                    )}
                  </Show>
                )
              }}
            </For>
          </div>
        </Show>
        <div class="btns">
          <button
            disabled={scanning() || mintsToScan().length === 0}
            onClick={runScan}
          >
            <Show when={scanning()} fallback={<IoSearchSharp />}>
              <IoRefreshSharp class="spin" />
            </Show>
            &nbsp;Suchen
          </button>
          <button disabled={scanning()} onClick={props.onDone}>
            {Object.keys(results()).length > 0 ? 'Continue to wallet' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Setup
