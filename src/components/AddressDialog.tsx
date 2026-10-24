import type {Component} from 'solid-js'
import {Show, createMemo, createSignal} from 'solid-js'

import Dialog from './Dialog'
import {useWallet} from '../WalletContext'
import {offlineMode} from '../offlineMode'
import {notify, NotifyKind, copyToClipboard} from '../helpers'
import {
  serverOf,
  encodeCx1,
  registerUsername,
  unregisterUsername
} from '../lnurlcash'
import {cashAddressBranch, cashAddressSecretAtIndex} from '../cashSecrets'
import {
  registeredAddresses,
  addRegisteredAddress,
  removeRegisteredAddress,
  type RegisteredAddress
} from '../addressRegistry'
import {isValidNpub} from '../nostrAddress'

export type AddressDialogProps = {
  server: string
  onClose: () => void
}

// LUD-25's cx1 registration (see 25.md's Seed & derivation) AND
// managing an already-claimed one - npub, unclaiming - scoped to one mint
// at a time and opened from that mint's own "@" button on the Mint page.
// Address IDENTITY only: checking for new notes, and the auto-check
// scheduler that triggers that automatically, both live in the sibling
// RescanDialog now, opened from its own button - the two used to be
// crammed into this one dialog, which made "is there anything to scan
// here" depend on whether this wallet happened to have claimed a
// username, when in truth a rescan is exactly as meaningful (and exactly
// the same seed-derived branch, see cashSecrets.ts's cashAddressBranch)
// with or without one.
const AddressDialog: Component<AddressDialogProps> = props => {
  const {state} = useWallet()
  const registered = createMemo(() =>
    registeredAddresses().find(a => a.server === props.server)
  )

  // ---- claim (no registration yet) ----
  const [username, setUsername] = createSignal('')
  const [npub, setNpub] = createSignal('')
  const [claiming, setClaiming] = createSignal(false)

  const claim = async () => {
    const name = username().trim().toLowerCase()
    if (!name) {
      notify('Gib einen Namen ein.', NotifyKind.ERROR)
      return
    }
    const npubValue = npub().trim()
    if (npubValue && !isValidNpub(npubValue)) {
      notify('Das ist kein gültiger npub.', NotifyKind.ERROR)
      return
    }
    // cashAddressBranch/cashAddressSecretAtIndex derive under the bare
    // host (serverOf), never props.server's own full origin directly - see
    // src/lib/urls.ts's serverOf for why a seed-derived branch must not
    // fragment across schemes/ports the way a signing-key pin legitimately
    // does
    const branch = cashAddressBranch(serverOf(props.server))
    // this branch's own index-0 note secret - required as this request's
    // ownership proof (see lib/signature.ts's signAddressProof), even for
    // a fresh claim: SERVICE only checks it against whatever's already on
    // file, so it's harmless to always send
    const proofKey = cashAddressSecretAtIndex(serverOf(props.server), 0)
    if (!branch || !proofKey) {
      notify(
        'Dafür braucht die Wallet ihre zwölf Wörter — stell sie zuerst wieder her.',
        NotifyKind.ERROR
      )
      return
    }
    setClaiming(true)
    try {
      const cx1 = encodeCx1(branch.pubkeyXOnly, branch.chainCode)
      await registerUsername(
        props.server,
        name,
        cx1,
        proofKey,
        npubValue || undefined
      )
      addRegisteredAddress(props.server, name, npubValue || undefined)
      notify(
        `${name}@${serverOf(props.server)} gehört jetzt dir.`,
        NotifyKind.SUCCESS
      )
      // stays open - registered() flips truthy now, so this same dialog
      // re-renders straight into the manage view below instead of closing
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setClaiming(false)
    }
  }

  // ---- manage (already registered) ----
  const [busy, setBusy] = createSignal(false)
  const [confirmUnclaim, setConfirmUnclaim] = createSignal(false)

  const unclaim = async (addr: RegisteredAddress) => {
    const proofKey = cashAddressSecretAtIndex(serverOf(addr.server), 0)
    if (!proofKey) {
      notify(
        'Dafür braucht die Wallet ihre zwölf Wörter — stell sie zuerst wieder her.',
        NotifyKind.ERROR
      )
      return
    }
    setBusy(true)
    try {
      await unregisterUsername(addr.server, addr.username, proofKey)
      removeRegisteredAddress(addr.server, addr.username)
      setConfirmUnclaim(false)
      notify(
        `${addr.username}@${serverOf(addr.server)} ist freigegeben.`,
        NotifyKind.SUCCESS
      )
      props.onClose()
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setBusy(false)
    }
  }

  // Röhren-Bild statt des Original-Formulars (Steve, 2026-10-24): ein Feld, darunter die fertige Adresse
  // groß; angelegt steht sie groß da, mit Kopieren. Logik oben unverändert.
  const stelle = () => serverOf(props.server)
  const name = () => username().trim().toLowerCase()

  return (
    <Dialog onClose={props.onClose}>
      <div class="rz-blatt rz-schein-blatt rz-umziehen rz-adresse-blatt">
        <Show
          when={registered()}
          fallback={
            <>
              <h3>Deine Adresse bei {stelle()}</h3>
              <label class="rz-feldname" for="ad-name">
                Name
              </label>
              <input
                id="ad-name"
                class="rz-feld"
                type="text"
                placeholder="gerhard"
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
                value={username()}
                onInput={e => setUsername(e.currentTarget.value)}
                onKeyDown={e => e.key === 'Enter' && void claim()}
              />
              <p class="rz-adresse-gross" classList={{leer: !name()}}>
                {name() || 'name'}@{stelle()}
              </p>
              <p class="rz-hinweis">
                Wer zuerst kommt, bekommt den Namen. Wer an diese Adresse zahlt,
                zahlt in diese Wallet — einlösen kann nur sie.
              </p>
              <details class="rz-erweitert">
                <summary>Mit Nostr verknüpfen (freiwillig)</summary>
                <input
                  class="rz-feld"
                  type="text"
                  placeholder="npub1…"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck={false}
                  value={npub()}
                  onInput={e => setNpub(e.currentTarget.value)}
                />
                <p class="rz-hinweis">
                  Dann gilt die Adresse auch als Nostr-Name (NIP-05) für diesen
                  Schlüssel — jeder kann ihn darüber nachschlagen.
                </p>
              </details>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                disabled={
                  claiming() ||
                  offlineMode() ||
                  state() !== 'unlocked' ||
                  !name()
                }
                onClick={() => void claim()}
              >
                <span class="lbl">
                  {claiming() ? 'Einen Moment …' : 'Adresse anlegen'}
                </span>
              </button>
            </>
          }
        >
          {addr => (
            <>
              <h3>Deine Adresse</h3>
              <p class="rz-adresse-gross">
                {addr().username}@{serverOf(addr().server)}
              </p>
              <p class="rz-hinweis rz-mitte">
                Angelegt am{' '}
                {new Date(addr().registeredAt).toLocaleDateString('de-AT')}
              </p>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                onClick={() =>
                  void copyToClipboard(
                    `${addr().username}@${serverOf(addr().server)}`
                  )
                }
              >
                <span class="lbl">Adresse kopieren</span>
              </button>
              <Show when={addr().npub}>
                {npubValue => (
                  <button
                    type="button"
                    class="rz-leise rz-block rz-mitte"
                    onClick={() => void copyToClipboard(npubValue())}
                  >
                    Verknüpfter Nostr-Schlüssel kopieren
                  </button>
                )}
              </Show>
              <Show
                when={confirmUnclaim()}
                fallback={
                  <button
                    type="button"
                    class="rz-leise rz-block rz-mitte"
                    disabled={busy()}
                    onClick={() => setConfirmUnclaim(true)}
                  >
                    Adresse freigeben
                  </button>
                }
              >
                <p class="rz-hinweis">
                  Danach kann jeder den Namen sofort für sich anlegen — du
                  bekommst ihn nur zurück, wenn du schneller bist.
                </p>
                <button
                  type="button"
                  class="rz-knopf rz-weiter"
                  disabled={busy()}
                  onClick={() => void unclaim(addr())}
                >
                  <span class="lbl">
                    {busy() ? 'Einen Moment …' : 'Freigeben'}
                  </span>
                </button>
                <button
                  type="button"
                  class="rz-leise rz-block rz-mitte"
                  disabled={busy()}
                  onClick={() => setConfirmUnclaim(false)}
                >
                  Behalten
                </button>
              </Show>
            </>
          )}
        </Show>
      </div>
    </Dialog>
  )
}
export default AddressDialog
