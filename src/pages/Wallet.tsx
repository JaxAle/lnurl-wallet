import type {Component} from 'solid-js'
import {
  Show,
  For,
  createSignal,
  createMemo,
  createEffect,
  on,
  onMount,
  onCleanup
} from 'solid-js'
import {render} from 'solid-js/web'
import {A, useNavigate, useSearchParams} from '@solidjs/router'
import {QRCodeSVG, ErrorCorrectionLevel} from 'solid-qr-code'
import {
  IoAddCircleSharp,
  IoLockOpenSharp,
  IoRefreshSharp,
  IoTrashSharp,
  IoGitMergeSharp,
  IoGitBranchSharp,
  IoSwapHorizontalSharp,
  IoBanSharp,
  IoCloseCircleSharp,
  IoSearchSharp,
  IoCloseSharp,
  IoArrowUpSharp,
  IoArrowDownSharp,
  IoLayersSharp,
  IoDownloadSharp,
  IoPencilSharp,
  IoQrCodeSharp,
  IoClipboardSharp,
  IoReturnDownForwardSharp,
  IoEllipsisVerticalSharp,
  IoSwapVerticalSharp,
  IoPricetagsSharp,
  IoAtCircleSharp,
  IoKeySharp
} from 'solid-icons/io'
import {MdSharpKeyboard} from 'solid-icons/md'

import {useWallet, groupByServer} from '../WalletContext'
import {storeableMeltAddresses} from '../storeableLinks'
import type {Bearer} from '../storage'
import {splitBearerIntoAmounts, type SplitTarget} from '../noteSplitting'
import {
  serverOf,
  toBech32Lnurl,
  isBolt11Invoice,
  isLightningAddress,
  isValidNoteInput
} from '../lnurlcash'
import {
  noteK1,
  requireNoteK1,
  withNewK1,
  fetchNoteInfo,
  rotateNote,
  upgradeNote,
  isCk1,
  isCw1,
  mergeNotes,
  splitNote,
  settleNote,
  probeBurnedNote,
  NoteSpentError,
  AmbiguousMutationError
} from '../lnurlcash'
import {
  deviceRefresh,
  migrateNoteToDevice,
  markDeviceNoteSpent,
  deviceMerge,
  deviceSplit,
  deviceSettle,
  requireDeviceClient
} from '../deviceOrchestration'
import {useDevice} from '../DeviceContext'
import {offlineMode} from '../offlineMode'
import {
  noteSortKey,
  setNoteSortKey,
  noteSortDesc,
  setNoteSortDesc,
  noteGroupByMint,
  setNoteGroupByMint
} from '../notePrefs'
import {notify, NotifyKind, msatToSats, pasteFromClipboard} from '../helpers'
import {decodeTag, parseLabelTags} from '../noteTags'
import {takeMeltInvoice} from '../meltHandoff'
import {receiveIntoWallet} from '../receive'
import BearerCard from '../components/BearerCard'
import Dialog from '../components/Dialog'
import TransferDialog from '../components/TransferDialog'
import SendToPubkeyDialog from '../components/SendToPubkeyDialog'
import MeltDialog from '../components/MeltDialog'
import ScanToggle from '../components/ScanToggle'
import NfcToggle from '../components/NfcToggle'
import FiatValue from '../components/FiatValue'
import Zaehlwerk from '../roehren/Zaehlwerk'
import Knoepfe from '../roehren/Knoepfe'
import {unterwegs} from '../roehren/einloesen'
import {eingang, setEingang} from '../roehren/uebergabe'
import {aufDeutsch} from '../roehren/fehler'
import Scheine from '../roehren/Scheine'
import {offenZurPruefung} from '../roehren/Pruefwache'
import {trustedMints} from '../trustedMints'
import {
  beobachte,
  erreichbar,
  gebunden,
  nichtErreichbar,
  vorgaenge
} from '../roehren/klaerung'
import {merkeTeilGebuehr} from '../roehren/gebuehren'
import type {ScheineMotor} from '../roehren/Scheine'

const Wallet: Component<{
  ansicht?: 'start' | 'scheine' | 'werkstatt'
}> = props => {
  // Fork: /scheine (Reiter im Profi-Modus) zeigt nur die Liste, /wallet nur Zählwerk und Schalter
  // Fork: die Werkstatt (/scheine/werkstatt) ist das Original des Reiters, ohne unsere Kacheln
  const werkstatt = () => props.ansicht === 'werkstatt'
  const scheineAnsicht = () => props.ansicht === 'scheine' || werkstatt()
  const navigate = useNavigate()
  const {
    state,
    bearers,
    unlock,
    addBearer,
    updateBearer,
    removeBearer,
    logActivity
  } = useWallet()
  const {client: deviceClient} = useDevice()
  const [password, setPassword] = createSignal('')
  const [unlocking, setUnlocking] = createSignal(false)
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [confirmClearSpent, setConfirmClearSpent] = createSignal(false)
  // collapsed by default, same reasoning MintGroupCard used to have per
  // mint - now a single wallet-wide toggle since notes no longer live in
  // separate per-mint sections
  const [showSpent, setShowSpent] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal('')
  // tag ids (see noteTags.ts) currently filtering the list - a note matches
  // once it carries any one of these, not all of them; empty means no tag
  // filter is active at all, same "off" meaning as an empty searchQuery
  const [selectedTags, setSelectedTags] = createSignal<Set<string>>(new Set())
  // the search field starts collapsed to a plain button, like the other
  // list-controls toggles - opening it mounts the actual input (see the
  // ref below, which focuses it the moment it appears)
  const [showSearch, setShowSearch] = createSignal(false)
  let searchInputRef: HTMLInputElement | undefined
  // remembered across reloads (see notePrefs.ts) instead of always
  // resetting to Updated/descending/ungrouped
  const sortKey = noteSortKey
  const setSortKey = setNoteSortKey
  const sortDesc = noteSortDesc
  const setSortDesc = setNoteSortDesc
  const groupByMint = noteGroupByMint
  const setGroupByMint = setNoteGroupByMint
  const [combining, setCombining] = createSignal(false)
  const [showSplitInput, setShowSplitInput] = createSignal(false)
  const [splitSats, setSplitSats] = createSignal('')
  const [splitting, setSplitting] = createSignal(false)
  // refresh/label/mark-spent act on every selected note at once; split
  // (still one note in, two out) stays limited to exactly one - all moved
  // here from BearerCard so they live in the same action bar as
  // Combine/Combine & split/Transfer, instead of each note carrying its own
  // copy of these buttons
  const [refreshing, setRefreshing] = createSignal(false)
  // separate from refreshing above (which is scoped to the current
  // selection) - Refresh all acts on every unspent note regardless of
  // what's selected, so it needs its own spinner state
  const [refreshingAll, setRefreshingAll] = createSignal(false)
  const [showSplitSingleInput, setShowSplitSingleInput] = createSignal(false)
  const [splitSingleSats, setSplitSingleSats] = createSignal('')
  const [splitSingleTimes, setSplitSingleTimes] = createSignal('1')
  const [splittingSingle, setSplittingSingle] = createSignal(false)
  // split/combine outputs as plain bearer preimages (64-hex short-form h)
  // instead of seed-derived key-path notes - see splitNote's MutationOptions
  const [plainSecret, setPlainSecret] = createSignal(false)
  const [showLabelInput, setShowLabelInput] = createSignal(false)
  const [labelInputValue, setLabelInputValue] = createSignal('')
  // Label/Mark spent/Export/QR live behind this toggle instead of the
  // primary action row - closes on an outside click, same as any other
  // dropdown, and on picking one of its own items (see the click handlers
  // below that wrap each item's action)
  const [showMoreMenu, setShowMoreMenu] = createSignal(false)
  let moreMenuRef: HTMLDivElement | null = null
  // same collapse-behind-one-button treatment as More below, for the same
  // reason: Amount vs. Updated (plus each one's own direction) was four
  // buttons/states fighting for space next to a plain "Sort:" label -
  // one button showing the active choice, a panel for picking the other
  const [showSortMenu, setShowSortMenu] = createSignal(false)
  let sortMenuRef: HTMLDivElement | null = null
  // Rotate all/Remove all spent - wallet-wide actions that don't depend on
  // a selection, so they live up here rather than in .selection-toolbar's
  // own More (which only ever shows once something is selected) - same
  // collapse-behind-one-button treatment as that one and Sort above
  const [showListMoreMenu, setShowListMoreMenu] = createSignal(false)
  let listMoreMenuRef: HTMLDivElement | null = null
  // same collapse-behind-one-button treatment as Sort/More above - a panel
  // listing every tag currently in use (see noteTags.ts), toggled on/off
  // the active filter set rather than picking just one
  const [showTagMenu, setShowTagMenu] = createSignal(false)
  let tagMenuRef: HTMLDivElement | null = null
  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (moreMenuRef && !moreMenuRef.contains(target)) {
        setShowMoreMenu(false)
      }
      if (sortMenuRef && !sortMenuRef.contains(target)) {
        setShowSortMenu(false)
      }
      if (listMoreMenuRef && !listMoreMenuRef.contains(target)) {
        setShowListMoreMenu(false)
      }
      if (tagMenuRef && !tagMenuRef.contains(target)) {
        setShowTagMenu(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    onCleanup(() => document.removeEventListener('mousedown', onDocClick))
  })
  // captured once Transfer is clicked, independent of live selection -
  // starting a transfer immediately marks the source spent, which would
  // otherwise drop it out of selectedEligible() and yank the dialog out
  // from under itself mid-flight
  const [transferSource, setTransferSource] = createSignal<Bearer | null>(null)
  // same capture-at-click reasoning as transferSource above - Send to
  // pubkey's own dialog burns its inputs itself, which would otherwise drop
  // them out of selectedEligible() and pull the dialog's props out from
  // under it mid-flight
  const [sendToPubkeySource, setSendToPubkeySource] = createSignal<
    Bearer[] | null
  >(null)
  // mutually exclusive - opening one closes the other rather than letting
  // both dialogs be up (and independently mutating wallet state) at once.
  // No 'send' anymore - carving an exact amount out of one or more notes is
  // already covered by this page's own Combine & split / Split toolbar
  // actions, so a standalone Send dialog was pure duplication
  const [openDialog, setOpenDialog] = createSignal<'melt' | null>(null)
  const showMelt = () => openDialog() === 'melt'
  // a bolt11 pasted into Receive hands off here (see meltHandoff.ts) rather
  // than duplicating invoice-vs-note detection on this page too - MeltDialog
  // reads it once as its own initialInvoice, pre-filled instead of a blank
  // paste step
  const [meltHandoffInvoice, setMeltHandoffInvoice] = createSignal<
    string | null
  >(null)
  onMount(() => {
    const pr = takeMeltInvoice()
    if (pr && isBolt11Invoice(pr)) {
      setMeltHandoffInvoice(pr)
      setOpenDialog('melt')
    }
  })

  // the hero's own scan/NFC/paste widget replaces the separate
  // Receive/Send/Melt buttons it used to have - whatever's recognized
  // decides which dialog opens, instead of making the holder pick the
  // right button before they've even entered anything
  const [heroValue, setHeroValue] = createSignal('')
  let heroPasteRef: HTMLInputElement | null = null
  // the hero paste field is hidden behind a keyboard icon on mobile (see
  // .paste-keyboard-btn) - scan/NFC/clipboard-paste cover the common case,
  // typing is the fallback. Desktop ignores this signal entirely (CSS only
  // hides the field under the mobile breakpoint)
  const [showHeroKeyboard, setShowHeroKeyboard] = createSignal(false)
  // a scanned/pasted bearer note redeems immediately - no confirmation
  // dialog in between, unlike ReceiveDialog's own review-first flow for a
  // vault handoff link (Claim.tsx), where there's an actual reason to
  // pause: the person hasn't asked for anything yet, they've just followed
  // a link. Here they scanned or pasted with clear intent to receive.
  const [heroReceiving, setHeroReceiving] = createSignal(false)
  // Fork: Senden/Empfangen öffnen ein Blatt mit den Werkzeugen des Originals (roehren/Knoepfe).
  // Es schließt sich, sobald eine Rechnung zum Zahlen weitergereicht ist oder ein Schein
  // fertig empfangen wurde — dann übernimmt der Dialog bzw. zählt das Zählwerk.
  const [blatt, setBlatt] = createSignal<'senden' | 'empfangen' | null>(null)
  // vom Empfangen-Bildschirm: Gescanntes/Eingefügtes mit dem Werkzeug des Originals verarbeiten
  createEffect(() => {
    const wert = eingang()
    if (wert === null) return
    setEingang(null)
    handleHeroValue(wert)
  })
  // vom Senden-Bildschirm: „Rechnung oder Adresse bekommen? bezahlen ›“
  const [suche, setSuche] = useSearchParams()
  onMount(() => {
    if (suche.bezahlen) {
      setBlatt('senden')
      setSuche({bezahlen: undefined})
    }
  })
  // Verbergen heißt nicht verschweigen: was unterwegs ist, steht als eine Zeile da (Prototyp)
  const unterwegsScheine = createMemo(() => {
    const ids = new Set(unterwegs())
    return bearers().filter(b => ids.has(b.id) && !b.spent)
  })
  createEffect(
    on(openDialog, d => d === 'melt' && setBlatt(null), {defer: true})
  )
  createEffect(
    on(heroReceiving, (jetzt, vorher) => vorher && !jetzt && setBlatt(null), {
      defer: true
    })
  )
  // same idea as meltHandoffInvoice above, for a scanned/pasted Lightning
  // Address that doesn't have an invoice yet - MeltDialog resolves it via
  // its own initialAddress
  const [meltHandoffAddress, setMeltHandoffAddress] = createSignal<
    string | null
  >(null)
  // the hero widget's own picker for a saved (LUD-11) melt address, opened
  // via the '@' button next to it - only ever shown when there's at least
  // one to pick (see storeableLinks.ts's storeableMeltAddresses), same
  // list MeltDialog's own saved-addresses section already offers, just
  // reachable straight from the hero without opening that dialog blank
  // first
  const [showSavedAddresses, setShowSavedAddresses] = createSignal(false)

  const closeMelt = () => {
    setOpenDialog(null)
    setMeltHandoffInvoice(null)
    setMeltHandoffAddress(null)
  }

  const isValidHeroInput = (v: string) =>
    isValidNoteInput(v) || isBolt11Invoice(v) || isLightningAddress(v)

  // re-entrancy-guarded the same way ReceiveDialog's own receive is: a
  // scanner double-fire or Enter-key/confirm-click landing together must
  // not run two receives for the same k1
  const receiveHero = async (noteValue: string) => {
    if (heroReceiving()) return
    setHeroReceiving(true)
    // Fork: eine Stelle, von der man einen Schein hält, trägt das Original still ein — hier wird es
    // gesagt (Gerhard, 2026-10-13: Schein von dnis Wallet ging ohne eingetragene Ausgabestelle)
    const vorher = new Set(trustedMints().map(m => m.server))
    try {
      await receiveIntoWallet(noteValue, {
        bearers: bearers(),
        addBearer,
        updateBearer,
        logActivity,
        deviceClient: deviceClient()
      })
      for (const m of trustedMints().filter(t => !vorher.has(t.server))) {
        const host = serverOf(m.server)
        const text = `${host} ist eine neue Ausgabestelle und steht jetzt in deiner Liste — sie verwahrt die Sats hinter diesem Schein.`
        logActivity('refresh', `Neue Ausgabestelle: ${text}`)
        notify(text)
      }
    } catch (err) {
      notify(aufDeutsch(err), NotifyKind.ERROR)
    } finally {
      setHeroReceiving(false)
    }
  }

  const handleHeroValue = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') return
    if (isValidNoteInput(trimmed)) {
      setHeroValue('')
      receiveHero(trimmed)
      return
    }
    if (isBolt11Invoice(trimmed)) {
      setMeltHandoffInvoice(trimmed)
      setHeroValue('')
      setOpenDialog('melt')
      return
    }
    if (isLightningAddress(trimmed)) {
      setMeltHandoffAddress(trimmed)
      setHeroValue('')
      setOpenDialog('melt')
      return
    }
    notify(
      'Das ist kein Schein, keine Rechnung und keine Lightning-Adresse.',
      NotifyKind.ERROR
    )
  }

  const handleHero = () => {
    if (heroValue() === '') return
    handleHeroValue(heroValue())
  }

  const pasteHero = async () => {
    const text = await pasteFromClipboard()
    if (text === null) return
    setHeroValue(text)
    setShowHeroKeyboard(true)
    heroPasteRef?.focus()
    handleHeroValue(text)
  }

  const onHeroScan = (raw: string) => {
    setHeroValue(raw)
    handleHeroValue(raw)
  }

  // click-to-select from the '@' picker below - same dispatch a typed/
  // pasted/scanned Lightning Address already goes through
  const selectSavedAddress = (address: string) => {
    setShowSavedAddresses(false)
    handleHeroValue(address)
  }

  const savedAddressPicker = () => (
    <Show when={showSavedAddresses()}>
      <Dialog onClose={() => setShowSavedAddresses(false)}>
        <>
          <h4>Gespeicherte Adresse bezahlen</h4>
          <div class="mint-picker">
            <For each={storeableMeltAddresses()}>
              {link => (
                <span class="mint-picker-entry">
                  <button onClick={() => selectSavedAddress(link.address)}>
                    {link.address}
                    <Show when={link.internalTransfer}>
                      <span
                        class="mint-picker-transfer-badge"
                        title="Diese Adresse unterstützte zuletzt die interne Übertragung (LUD-25) – hast du Scheine ihrer Ausgabestelle, geht die Zahlung ganz ohne Lightning"
                      >
                        &nbsp;· interne Übertragung
                      </span>
                    </Show>
                  </button>
                </span>
              )}
            </For>
          </div>
        </>
      </Dialog>
    </Show>
  )

  // the hero's balance/mint count is always the spendable view (excludes
  // spent notes) - "Total balance" shouldn't count sats that aren't
  // actually yours to spend anymore.
  const spendableBearers = createMemo(() => bearers().filter(b => !b.spent))
  const spentBearers = createMemo(() => bearers().filter(b => b.spent))
  const spentCount = createMemo(() => spentBearers().length)
  const spendableTotal = createMemo(() =>
    spendableBearers().reduce((sum, b) => sum + b.amount, 0)
  )
  const spentTotal = createMemo(() =>
    spentBearers().reduce((sum, b) => sum + b.amount, 0)
  )
  const mintCount = createMemo(() => groupByServer(spendableBearers()).length)
  // Fork: die große Zahl zeigt nur, was sicher ist — Ungeprüftes steht leise darunter (Steve, 2026-10-12)
  const pruefSumme = createMemo(() =>
    bearers()
      .filter(offenZurPruefung)
      .reduce((sum, b) => sum + b.amount, 0)
  )
  // Ungeprüftes, das zu einem ungeklärten Vorgang gehört, ist kein Zuwachs — die Eingänge zählen schon
  const pruefSummeFrei = createMemo(() => {
    const g = gebunden()
    return bearers()
      .filter(b => offenZurPruefung(b) && !g.has(b.id))
      .reduce((sum, b) => sum + b.amount, 0)
  })
  const sicherTotal = () => spendableTotal() - pruefSumme()

  // notes no longer live in per-mint sections - one flat list for the
  // whole wallet, always ordered by the chosen sort criteria below
  const visibleBearers = createMemo(() =>
    showSpent() ? bearers() : bearers().filter(b => !b.spent)
  )

  // every distinct tag currently in use among the notes being shown (see
  // noteTags.ts) - a tag only found on a hidden spent note doesn't appear
  // here either, same visibility rule Show spent already applies to the
  // list itself
  const availableTags = createMemo(() => {
    const tags = new Set<string>()
    for (const b of visibleBearers()) {
      for (const tag of parseLabelTags(b.label || '').tags) tags.add(tag)
    }
    return [...tags].sort((a, b) => decodeTag(a).localeCompare(decodeTag(b)))
  })

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  // matches either the issuing mint's hostname or the note's sat amount -
  // msatToSats formats with locale thousands separators (e.g. "1,000"),
  // which would never match a plain typed "1000", so amount matching goes
  // straight off the raw sats value instead. A tag filter (if any tags are
  // selected) is ANDed on top: a note need only carry one of them, not all
  const filteredBearers = createMemo(() => {
    const q = searchQuery().trim().toLowerCase()
    const tags = selectedTags()
    return visibleBearers().filter(b => {
      if (
        q &&
        !serverOf(b.url).toLowerCase().includes(q) &&
        !String(Math.floor(b.amount / 1000)).includes(q)
      ) {
        return false
      }
      if (tags.size > 0) {
        const noteTags = parseLabelTags(b.label || '').tags
        if (!noteTags.some(t => tags.has(t))) return false
      }
      return true
    })
  })

  const sortedBearers = createMemo(() => {
    const key = sortKey()
    const factor = sortDesc() ? -1 : 1
    return [...filteredBearers()].sort((a, b) => {
      const diff =
        key === 'amount' ? a.amount - b.amount : a.updatedAt - b.updatedAt
      return diff * factor
    })
  })

  // clicking the same sort button again flips direction instead of doing
  // nothing; switching to a different key starts it off descending
  // (highest amount / most recently updated first - the more common ask)
  const toggleSort = (key: 'amount' | 'updated') => {
    if (sortKey() === key) setSortDesc(!sortDesc())
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  // every mint present in the currently filtered/sorted view, in the order
  // they first appear there - the grouping Show below renders one heading
  // + sub-list per entry instead of one flat grid
  const groupedBearers = createMemo(() => {
    const groups = new Map<string, Bearer[]>()
    for (const b of sortedBearers()) {
      const server = serverOf(b.url)
      const list = groups.get(server)
      if (list) list.push(b)
      else groups.set(server, [b])
    }
    return [...groups.entries()]
  })

  // combine/split/transfer only ever act on notes from one mint, so the
  // selection itself enforces that instead of just silently disabling the
  // buttons once it's already mixed: picking a note from a different mint
  // than what's currently selected starts a fresh selection with just that
  // note, rather than adding to a mix that could never do anything anyway
  const toggleSelect = (id: string, isSelected: boolean) => {
    if (!isSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }
    const bearer = bearers().find(b => b.id === id)
    const server = bearer && serverOf(bearer.url)
    const current = selectedServer()
    setSelected(prev => {
      if (server && current && server !== current) return new Set([id])
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  // combine/split/transfer all require every selected note to share one
  // issuing mint - toggleSelect above is what actually enforces that as
  // notes are picked, this just reads back the mint that's currently
  // selected (if any) so toggleSelect knows when a click should start a
  // fresh selection instead of extending the current one
  const selectedBearers = createMemo(() =>
    bearers().filter(b => selected().has(b.id))
  )
  const selectedServer = createMemo(() => {
    const servers = new Set(selectedBearers().map(b => serverOf(b.url)))
    return servers.size === 1 ? [...servers][0] : null
  })
  const selectedEligible = createMemo(() =>
    selectedBearers().filter(b => b.callback !== '' && !b.spent)
  )
  const canCombine = createMemo(() => selectedEligible().length >= 2)
  const canTransfer = createMemo(() => selectedEligible().length === 1)
  // refresh/label/mark-spent all work on any number of selected notes
  // regardless of verification (refresh is how a note becomes verified in
  // the first place) - selectedBearers is always all-unspent already,
  // since BearerCard's own click-to-select refuses a spent note to begin
  // with, so these just need at least one selected. Split needs the
  // stricter selectedEligible (verified + a callback) and stays limited to
  // exactly one, same as before
  const canRefreshSelected = createMemo(() => selectedBearers().length > 0)
  const canMarkSpentSelected = createMemo(() => selectedBearers().length > 0)
  const canLabelSelected = createMemo(() => selectedBearers().length > 0)
  const canSplitSingle = createMemo(() => selectedEligible().length === 1)
  // Send to pubkey (combine and/or split naming a pasted cp1 as the
  // output) needs at least one verified, unspent note - unlike Combine it
  // works fine on just one (a plain send, or a send + change split) - and,
  // unlike Combine/Combine & split, has no device-vault equivalent yet (see
  // SendToPubkeyDialog's own header comment), so device-backed notes are
  // excluded here rather than failing loudly once Send is clicked
  const canSendToPubkey = createMemo(
    () =>
      selectedEligible().length > 0 &&
      selectedEligible().every(b => !b.deviceId)
  )

  const unlockWallet = async (e: Event) => {
    e.preventDefault()
    setUnlocking(true)
    try {
      await unlock(password())
      setPassword('')
    } catch {
      notify('Falsches Passwort.', NotifyKind.ERROR)
    } finally {
      setUnlocking(false)
    }
  }

  const clearAllSpent = () => {
    const spent = spentBearers()
    for (const bearer of spent) removeBearer(bearer.id)
    setConfirmClearSpent(false)
    notify(
      `${spent.length} ausgegebene${spent.length === 1 ? 'n Schein' : ' Scheine'} entfernt.`,
      NotifyKind.SUCCESS
    )
  }

  // a note's own url IS the bearer asset (see storage.ts) - one per line is
  // exactly what's needed to hand each off elsewhere (paste into another
  // wallet's Receive field, redeem directly, ...), no extra formatting to
  // strip first. bech32 (the "LNURL1..." form, same encoding Qr.tsx/Scan use
  // elsewhere in this wallet) rather than the raw https:// URL, since that's
  // the form other LNURL wallets actually expect pasted or scanned. Client-
  // side only, same download-a-Blob approach Backup.tsx already uses for the
  // full-wallet backup file.
  const exportSelected = () => {
    const picked = selectedBearers()
    if (picked.length === 0) return
    const text = picked.map(b => toBech32Lnurl(b.url)).join('\n') + '\n'
    const blob = new Blob([text], {type: 'text/plain'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lnurlwallet-notes-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    notify(
      `${picked.length} Schein${picked.length === 1 ? '' : 'e'} in eine Textdatei exportiert.`,
      NotifyKind.SUCCESS
    )
  }

  // renders QRCodeSVG into a detached container just long enough to pull
  // its rendered <svg> back out - same trick Qr.tsx's own download button
  // uses (see its comment), just without ever attaching the container to
  // the visible page. render() (solid-js/web) mounts synchronously for
  // plain content like this, so the <svg> is there as soon as it returns.
  const svgForNote = (bearer: Bearer): string | null => {
    const container = document.createElement('div')
    const dispose = render(
      () => (
        <QRCodeSVG
          backgroundColor="white"
          backgroundAlpha={1}
          foregroundColor="black"
          foregroundAlpha={1}
          width={512}
          height={512}
          value={toBech32Lnurl(bearer.url)}
          level={ErrorCorrectionLevel.LOW}
        />
      ),
      container
    )
    const svg = container.querySelector('svg')
    const source = svg ? new XMLSerializer().serializeToString(svg) : null
    dispose()
    return source
  }

  // one .svg download per selected note - a single QR can only carry one
  // note's worth of data, so there's no meaningful "combined" file the way
  // the text export has; multiple notes just means multiple downloads,
  // triggered back to back the same way Export's own click already is
  const downloadQrSelected = () => {
    const picked = selectedBearers()
    if (picked.length === 0) return
    let downloaded = 0
    for (const bearer of picked) {
      const source = svgForNote(bearer)
      if (!source) continue
      const blob = new Blob([source], {type: 'image/svg+xml'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lnurlwallet-note-${Math.floor(bearer.amount / 1000)}sats-${bearer.id.slice(0, 6)}.svg`
      a.click()
      URL.revokeObjectURL(url)
      downloaded++
    }
    notify(
      `${downloaded} QR-Code${downloaded === 1 ? '' : 's'} als SVG heruntergeladen.`,
      NotifyKind.SUCCESS
    )
  }

  // The informational GET prefers h=sha256(k1), keeping the secret off the
  // wire on current services. Refresh still rotates to renew the note and to
  // handle the explicit raw-k1 compatibility fallback safely. When a vault is connected, that
  // replacement secret is generated and held there instead of in this
  // browser - for an already device-backed note that's deviceRefresh
  // (export, then GET+rotate with the same secret); for a browser-only
  // note it's a one-way migration onto the device (see
  // deviceOrchestration.ts's header comment). One note at a time - each
  // call already ends in its own notify()/logActivity() (unchanged from
  // the single-note version this was lifted from), so refreshing several
  // selected notes just reads as that many refreshes back to back, same as
  // clicking Refresh on each individually. Sequential, not Promise.all:
  // persistBearer reads localStorage fresh after its own encrypt step, so
  // concurrent writes here could race and clobber each other's records
  const refreshOneBearer = async (bearer: Bearer) => {
    try {
      const client = deviceClient()
      const deviceId = bearer.deviceId
      if (deviceId) {
        // A device-backed bearer's stored URL is deliberately only a
        // secret-free mirror. If its vault is disconnected, stop here with
        // the recovery action instead of falling through to fetchNoteInfo
        // and sending /w a request with neither k1 nor its device-held hash.
        const connectedClient = requireDeviceClient(client)
        const result = await deviceRefresh(connectedClient, {
          ...bearer,
          deviceId
        })
        await updateBearer(bearer.id, {
          url: result.url,
          callback: result.callback,
          amount: result.amountMsat,
          verified: true,
          mintPubkey: result.mintPubkey ?? bearer.mintPubkey,
          deviceId: result.deviceId,
          deviceHash: result.deviceHash
        })
        logActivity(
          'refresh',
          `${msatToSats(result.amountMsat)} Sats von ${serverOf(result.url)} erneuert (auf dem Tresor).`,
          bearer.label
        )
        notify('Schein erneuert.', NotifyKind.SUCCESS)
        return
      }

      const info = await fetchNoteInfo(bearer.url)

      if (client) {
        const migrated = await migrateNoteToDevice(client, {
          url: bearer.url,
          callback: info.callback,
          amount: info.maxWithdrawable
        })
        await updateBearer(bearer.id, {
          url: migrated.url,
          callback: migrated.callback,
          amount: info.maxWithdrawable,
          verified: true,
          mintPubkey: info.mintPubkey ?? bearer.mintPubkey,
          deviceId: migrated.deviceId,
          deviceHash: migrated.deviceHash
        })
        logActivity(
          'refresh',
          `${msatToSats(info.maxWithdrawable)} Sats von ${serverOf(migrated.url)} erneuert – auf den Tresor verschoben.`,
          bearer.label
        )
        notify(
          'Schein erneuert und auf den Tresor verschoben.',
          NotifyKind.SUCCESS
        )
        return
      }

      let url = bearer.url
      let rotationError: string | null = null
      try {
        const rotated = await rotateNote(
          info.callback,
          requireNoteK1(bearer.url)
        )
        url = withNewK1(
          bearer.url,
          rotated.k1,
          info.maxWithdrawable,
          rotated.signature
        )
      } catch (err) {
        if (err instanceof AmbiguousMutationError) {
          // the rotate request may have landed despite the failure - the
          // fresh secret it carried is then the only copy of this note
          const outcome = await probeBurnedNote(bearer.url)
          if (outcome === 'gone') {
            // the burn landed - adopt the fresh secret as the note
            url = withNewK1(bearer.url, err.newSecrets[0], info.maxWithdrawable)
          } else if (outcome === 'unknown') {
            // can't tell: keep the old note AND track the possible new
            // copy, rather than gamble either way
            await addBearer({
              url: withNewK1(
                bearer.url,
                err.newSecrets[0],
                info.maxWithdrawable
              ),
              callback: info.callback,
              amount: info.maxWithdrawable,
              verified: false,
              mintPubkey: info.mintPubkey ?? bearer.mintPubkey
            })
            rotationError = `${(err as Error).message} The rotation may still have gone through - the possible new copy is stored unverified alongside this one; refresh both to reconcile.`
          } else {
            rotationError = (err as Error).message
          }
        } else {
          rotationError = (err as Error).message
        }
      }
      await updateBearer(bearer.id, {
        url,
        callback: info.callback,
        amount: info.maxWithdrawable,
        verified: true,
        mintPubkey: info.mintPubkey ?? bearer.mintPubkey
      })
      logActivity(
        'refresh',
        `${msatToSats(info.maxWithdrawable)} Sats von ${serverOf(url)} erneuert.` +
          (rotationError ? ` Erneuern ging nicht (${rotationError}).` : ''),
        bearer.label
      )
      // the GET this refresh is nominally "about" is only ever a means to
      // the rotate - it succeeding on its own isn't worth telling the
      // holder about, so a failed rotate reports just the one thing that
      // actually matters (and is now exposed), not that plus an unrelated
      // "refreshed" success alongside it
      if (rotationError) {
        notify(
          `Erneuern nach der Abfrage ging nicht (${rotationError}) – das Geheimnis wurde eben übertragen; alte Kopien dieses Scheins gelten als offengelegt.`,
          NotifyKind.ERROR
        )
      } else {
        notify('Schein erneuert.', NotifyKind.SUCCESS)
      }
    } catch (err) {
      // the service just told us - unambiguously, this GET named exactly
      // this note's own k1 - that it's already spent. Trust it and lock
      // the note the same way markSpent() does, rather than leave it
      // sitting there looking spendable until someone notices by hand.
      if (err instanceof NoteSpentError) {
        await updateBearer(bearer.id, {spent: true})
        logActivity(
          'spent',
          `${serverOf(bearer.url)} meldet ${msatToSats(bearer.amount)} Sats als schon ausgegeben – hier markiert.`,
          bearer.label
        )
      }
      notify((err as Error).message, NotifyKind.ERROR)
    }
  }

  // The holder-initiated "Upgrade" action for a bearer (hash preimage)
  // note, reachable from its own button on
  // BearerCard.tsx - unlike refreshOneBearer's own rotate (which only ever
  // PRESERVES a note's existing kind, see isUpgradedSecret), this always
  // asks for a pub/sig replacement and surfaces a clear error if that isn't
  // possible right now (upgradeNote itself refuses rather than silently
  // completing an ordinary same-kind rotate). Same ambiguous-mutation
  // reconciliation (probeBurnedNote) refreshOneBearer's own rotate step
  // uses - the fresh secret here is just as irreplaceable if the request's
  // outcome is unclear.
  const upgradeOneBearer = async (bearer: Bearer) => {
    if (bearer.deviceId) {
      notify(
        'Ein Schein auf dem Tresor lässt sich noch nicht umstellen – das geht vorerst nur im Browser.',
        NotifyKind.ERROR
      )
      return
    }
    if (!bearer.callback) {
      notify(
        "This note hasn't been verified yet - refresh it first.",
        NotifyKind.ERROR
      )
      return
    }
    try {
      const k1 = requireNoteK1(bearer.url)
      const result = await upgradeNote(bearer.callback, k1)
      await updateBearer(bearer.id, {
        url: withNewK1(bearer.url, result.k1, bearer.amount, result.signature)
      })
      logActivity(
        'refresh',
        `Upgraded a ${msatToSats(bearer.amount)} sat note at ${serverOf(bearer.url)} to a recoverable pub/sig secret.`,
        bearer.label
      )
      notify(
        'Schein auf ein wiederherstellbares Geheimnis (pub/sig) umgestellt.',
        NotifyKind.SUCCESS
      )
    } catch (err) {
      if (err instanceof AmbiguousMutationError) {
        const outcome = await probeBurnedNote(bearer.url)
        if (outcome === 'gone') {
          // the burn landed - adopt the fresh secret as the note
          await updateBearer(bearer.id, {
            url: withNewK1(bearer.url, err.newSecrets[0], bearer.amount)
          })
          logActivity(
            'refresh',
            `Upgraded a ${msatToSats(bearer.amount)} sat note at ${serverOf(bearer.url)} to a recoverable pub/sig secret (confirmed on re-check after an uncertain response).`,
            bearer.label
          )
          notify(
            'Schein auf ein wiederherstellbares Geheimnis (pub/sig) umgestellt.',
            NotifyKind.SUCCESS
          )
          return
        }
        if (outcome === 'unknown') {
          // can't tell: keep the old note AND track the possible new copy,
          // rather than gamble either way
          await addBearer({
            url: withNewK1(bearer.url, err.newSecrets[0], bearer.amount),
            callback: bearer.callback,
            amount: bearer.amount,
            verified: false,
            mintPubkey: bearer.mintPubkey
          })
          notify(
            `${(err as Error).message} Die Umstellung kann trotzdem angekommen sein – die mögliche neue Kopie liegt ungeprüft daneben; beide erneuern, um es zu klären.`,
            NotifyKind.ERROR
          )
          return
        }
      }
      notify((err as Error).message, NotifyKind.ERROR)
    }
  }

  const refreshSelected = async () => {
    const picked = selectedBearers()
    if (picked.length === 0) return
    setRefreshing(true)
    try {
      for (const bearer of picked) {
        await refreshOneBearer(bearer)
      }
    } finally {
      setRefreshing(false)
    }
    setSelected(new Set<string>())
  }

  // every unspent note in the wallet, regardless of selection - same
  // one-at-a-time sequencing as refreshSelected, for the same reason
  // (persistBearer reads localStorage fresh per-write, so concurrent
  // refreshes could race and clobber each other's records)
  const refreshAllNotes = async () => {
    const picked = bearers().filter(b => !b.spent)
    if (picked.length === 0) return
    setRefreshingAll(true)
    try {
      for (const bearer of picked) {
        await refreshOneBearer(bearer)
      }
    } finally {
      setRefreshingAll(false)
    }
  }

  // a local-only lock (see storage.ts's Bearer.spent) - no network call,
  // just stops this wallet from acting on notes it considers given away.
  // A device-backed note's on-device copy is retired alongside (queued for
  // the next connect if the vault isn't attached right now), so the vault
  // doesn't keep listing as spendable a note this wallet considers gone
  const markSpentSelected = async () => {
    const picked = selectedBearers()
    if (picked.length === 0) return
    for (const bearer of picked) {
      updateBearer(bearer.id, {spent: true})
      if (bearer.deviceId) {
        await markDeviceNoteSpent(deviceClient(), bearer.deviceId)
      }
      logActivity(
        'spent',
        `${msatToSats(bearer.amount)} Sats von ${serverOf(bearer.url)} als ausgegeben markiert.`,
        bearer.label
      )
    }
    setSelected(new Set<string>())
    notify(
      `${picked.length} Schein${picked.length === 1 ? '' : 'e'} als ausgegeben markiert – Teilen und Erneuern sind gesperrt, bis die Markierung aufgehoben ist.`,
      NotifyKind.SUCCESS
    )
  }

  // purely local, for the holder's own reference - not part of the note
  // itself, never sent anywhere. Applies the same text to every selected
  // note at once; prefilled with their shared label when they already all
  // carry the same one, otherwise blank rather than guessing which to show
  const openLabelInput = () => {
    const picked = selectedBearers()
    if (picked.length === 0) return
    const labels = new Set(picked.map(b => b.label ?? ''))
    setLabelInputValue(labels.size === 1 ? [...labels][0]! : '')
    setShowLabelInput(true)
  }

  const saveLabelSelected = () => {
    const picked = selectedBearers()
    if (picked.length === 0) return
    const trimmed = labelInputValue().trim()
    for (const bearer of picked) {
      updateBearer(bearer.id, {label: trimmed || undefined})
    }
    setShowLabelInput(false)
    setLabelInputValue('')
    setSelected(new Set<string>())
    notify(
      `${picked.length} Schein${picked.length === 1 ? '' : 'e'} bezeichnet.`,
      NotifyKind.SUCCESS
    )
  }

  // splitNote is only ever a 2-way split (one piece + a change note), so
  // splitting off the same amount `times` times means chaining that many
  // calls, each peeling one more piece off the still-unspent "change" from
  // the previous one - the leftover remainder (whatever's left after all of
  // them) becomes the final note. A failure partway through (network drop,
  // etc.) leaves whichever pieces already came back safely recorded as
  // bearers, but the in-flight call's own "change" secret isn't recorded
  // anywhere if its response never arrives - same exposure a single split
  // already has, just repeated per extra time
  const splitSingleSelected = async () => {
    if (!canSplitSingle()) return
    const bearer = selectedBearers()[0]
    // whole sats only - satsToMsat alone would round a typed fractional
    // sat (e.g. "10.5") to the nearest msat, not the nearest sat, so a
    // split note could otherwise end up worth a sub-sat amount that isn't
    // really spendable as its own unit
    const sats = Math.trunc(Number(splitSingleSats()))
    const msat = sats * 1000
    const times = parseInt(splitSingleTimes(), 10)
    if (!splitSingleSats() || !Number.isFinite(sats) || sats <= 0) {
      notify('Bitte eine ganze Zahl Sats eingeben.', NotifyKind.ERROR)
      return
    }
    if (!Number.isFinite(times) || times < 1) {
      notify(
        'Bitte eingeben, wie oft geteilt wird (1 oder mehr).',
        NotifyKind.ERROR
      )
      return
    }
    if (msat * times >= bearer.amount) {
      notify('Die Summe muss kleiner sein als der Schein.', NotifyKind.ERROR)
      return
    }
    setSplittingSingle(true)
    try {
      const {totalFeeMsat, lastFeeMsat: perSplitFeeMsat} =
        await splitBearerIntoAmounts(
          bearer,
          Array<SplitTarget>(times).fill({amountMsat: msat}),
          {
            addBearer,
            updateBearer,
            removeBearer,
            logActivity,
            deviceClient,
            requireDeviceClient
          },
          {plain: plainSecret()}
        )
      // Fork: gemerkt für „Gebühr bei <Stelle>: zuletzt …“ (roehren/gebuehren.ts)
      merkeTeilGebuehr(serverOf(bearer.url), perSplitFeeMsat)
      const feeNote =
        totalFeeMsat > 0
          ? times > 1
            ? ` ${msatToSats(perSplitFeeMsat)} Sats Gebühr je Teilung abgezogen (insgesamt ${msatToSats(totalFeeMsat)} Sats).`
            : ` ${msatToSats(totalFeeMsat)} Sats Gebühr vom Rest abgezogen.`
          : ''
      logActivity(
        'split',
        `${times} Schein${times === 1 ? '' : 'e'} zu je ${msatToSats(msat)} Sats von ${serverOf(bearer.url)} abgeteilt.${feeNote}`,
        bearer.label
      )
      notify(
        `${times} Schein${times === 1 ? '' : 'e'} zu je ${msatToSats(msat)} Sats abgeteilt.${feeNote}`,
        NotifyKind.SUCCESS
      )
      setSelected(new Set<string>())
      setShowSplitSingleInput(false)
      setSplitSingleSats('')
      setSplitSingleTimes('1')
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setSplittingSingle(false)
    }
  }

  const combineSelected = async () => {
    const picked = selectedEligible()
    if (picked.length < 2) return
    setCombining(true)
    try {
      const [base] = picked
      const server = serverOf(base.url)
      const sum = picked.reduce((s, b) => s + b.amount, 0)
      let actualAmount: number
      const client = deviceClient()
      if (client) {
        // if a vault is connected, the merged note lands there instead -
        // regardless of whether any of the inputs were themselves
        // device-backed (mixed selections are fine, see
        // deviceOrchestration.ts)
        const merged = await deviceMerge(
          client,
          picked.map(b => ({deviceId: b.deviceId, url: b.url})),
          base.callback,
          sum
        )
        const settled = await deviceSettle(client, merged)
        actualAmount = settled.amountMsat
        for (const bearer of picked) removeBearer(bearer.id)
        await addBearer({
          url: settled.url,
          callback: settled.callback,
          amount: actualAmount,
          verified: true,
          mintPubkey: base.mintPubkey,
          deviceId: settled.deviceId,
          deviceHash: settled.deviceHash
        })
      } else {
        let mergedK1: string
        let mergedSignature: string | undefined
        try {
          const merged = await mergeNotes(
            base.callback,
            picked.map(b => requireNoteK1(b.url)),
            {plain: plainSecret()}
          )
          mergedK1 = merged.k1
          mergedSignature = merged.signature
        } catch (err) {
          if (!(err instanceof AmbiguousMutationError)) throw err
          // the merge request may have landed despite the failure - probe
          // one input before deciding what the carried secret is worth
          const outcome = await probeBurnedNote(base.url)
          if (outcome === 'live') throw err // nothing burned - plain failure
          if (outcome === 'unknown') {
            // can't tell: track the possible output without dropping the
            // inputs, and stop here
            await addBearer({
              url: withNewK1(base.url, err.newSecrets[0], sum),
              callback: base.callback,
              amount: sum,
              verified: false,
              mintPubkey: base.mintPubkey
            })
            throw new Error(
              'Das Zusammenlegen ist vielleicht angekommen, aber nicht bestätigt – der mögliche neue Schein liegt ungeprüft neben den alten; erneuern, um es zu klären.'
            )
          }
          // 'gone': the burn landed - the carried secret is the only money
          mergedK1 = err.newSecrets[0]
        }
        // the mint call above already burned every input server-side, so
        // the merged output is the only money left - it is stored BEFORE
        // any removeBearer of an input, then settled in place: a failed
        // settle leaves an unverified note a refresh can repair, not a
        // lost secret
        const added = await addBearer({
          url: withNewK1(base.url, mergedK1, sum, mergedSignature),
          callback: base.callback,
          amount: sum,
          verified: false,
          mintPubkey: base.mintPubkey
        })
        for (const bearer of picked) removeBearer(bearer.id)
        // a mint MAY refund part of its earlier per-note mint fees on merge
        // (LUD-25: (n - 1) * base_fee_msat back into the result) -
        // settleNote reads the actual value back authoritatively rather
        // than assume the naive sum. The hash lookup leaves the merged secret
        // untouched, while the stored amount and notice below still reflect
        // what the mint actually credited
        actualAmount = sum
        try {
          const settled = await settleNote(
            base.url,
            mergedK1,
            sum,
            mergedSignature
          )
          actualAmount = settled.amountMsat
          await updateBearer(added.id, {
            url: withNewK1(
              base.url,
              settled.k1,
              settled.amountMsat,
              settled.signature
            ),
            callback: settled.callback,
            amount: settled.amountMsat,
            verified: true
          })
        } catch (err) {
          notify(
            `Zusammengelegt, aber der neue Schein ist nicht fertig bestätigt (${(err as Error).message}) – er steht ungeprüft da; erneuern repariert ihn.`,
            NotifyKind.ERROR
          )
        }
      }
      setSelected(new Set<string>())
      // LUD-25 refunds (n - 1) * base_fee_msat on an n-note merge - the per-
      // note figure is exactly that division, same "X per unit (Y total)"
      // framing as BearerCard's split, so a combine of several notes
      // doesn't read as a single flat, ambiguous number either
      const creditMsat = actualAmount - sum
      const perNoteCreditMsat = creditMsat / (picked.length - 1)
      const creditNote =
        creditMsat > 0
          ? picked.length > 2
            ? ` ${msatToSats(perNoteCreditMsat)} Sats Gebühr je zusätzlichem Schein gutgeschrieben (insgesamt ${msatToSats(creditMsat)} Sats).`
            : ` ${msatToSats(creditMsat)} Sats Gebühr gutgeschrieben.`
          : ''
      logActivity(
        'combine',
        `${picked.length} Scheine von ${server} zu ${msatToSats(actualAmount)} Sats zusammengelegt.${creditNote}`,
        base.label
      )
      notify(
        `${picked.length} Scheine zu einem zusammengelegt.${creditNote}`,
        NotifyKind.SUCCESS
      )
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setCombining(false)
    }
  }

  // combine & split: same selection as combineSelected, but instead of
  // merging into one note, burns them all and mints two - splitSats() worth
  // and a change note for the remainder.
  const combineAndSplit = async () => {
    const picked = selectedEligible()
    if (picked.length < 2) return
    const sats = Math.trunc(Number(splitSats()))
    const msat = sats * 1000
    if (!splitSats() || !Number.isFinite(sats) || sats <= 0) {
      notify('Bitte eine ganze Zahl Sats eingeben.', NotifyKind.ERROR)
      return
    }
    const sum = picked.reduce((s, b) => s + b.amount, 0)
    if (msat >= sum) {
      notify(
        'Der abgeteilte Betrag muss kleiner sein als die Summe.',
        NotifyKind.ERROR
      )
      return
    }
    setSplitting(true)
    try {
      const [base] = picked
      const server = serverOf(base.url)
      let targetAmount: number
      let changeAmount: number
      const client = deviceClient()
      if (client) {
        const parts = await deviceSplit(
          client,
          picked.map(b => ({deviceId: b.deviceId, url: b.url})),
          base.callback,
          msat,
          sum
        )
        for (const bearer of picked) removeBearer(bearer.id)
        await addBearer({
          url: parts.target.url,
          callback: parts.target.callback,
          amount: msat,
          verified: true,
          mintPubkey: base.mintPubkey,
          deviceId: parts.target.deviceId,
          deviceHash: parts.target.deviceHash
        })
        const settledChange = await deviceSettle(client, parts.change)
        targetAmount = msat
        changeAmount = settledChange.amountMsat
        await addBearer({
          url: settledChange.url,
          callback: settledChange.callback,
          amount: settledChange.amountMsat,
          verified: true,
          mintPubkey: base.mintPubkey,
          deviceId: settledChange.deviceId,
          deviceHash: settledChange.deviceHash
        })
      } else {
        let partK1 = ''
        let partSignature: string | undefined
        let changeK1 = ''
        let changeSignature: string | undefined
        let splitError: Error | null = null
        try {
          const result = await splitNote(
            base.callback,
            picked.map(b => requireNoteK1(b.url)),
            msat,
            {plain: plainSecret()}
          )
          partK1 = result.k1
          partSignature = result.signature
          changeK1 = result.change
          changeSignature = result.changeSignature
        } catch (err) {
          splitError = err as Error
        }
        if (splitError) {
          if (!(splitError instanceof AmbiguousMutationError)) throw splitError
          const outcome = await probeBurnedNote(base.url)
          if (outcome === 'live') throw splitError
          if (outcome === 'unknown') {
            await addBearer({
              url: withNewK1(base.url, splitError.newSecrets[0], msat),
              callback: base.callback,
              amount: msat,
              verified: false,
              mintPubkey: base.mintPubkey
            })
            await addBearer({
              url: withNewK1(base.url, splitError.newSecrets[1], sum - msat),
              callback: base.callback,
              amount: sum - msat,
              verified: false,
              mintPubkey: base.mintPubkey
            })
            throw new Error(
              'Das Teilen ist vielleicht angekommen, aber nicht bestätigt – die möglichen neuen Scheine liegen ungeprüft neben den alten; erneuern, um es zu klären.'
            )
          }
          partK1 = splitError.newSecrets[0]
          changeK1 = splitError.newSecrets[1]
        }
        await addBearer({
          url: withNewK1(base.url, partK1, msat, partSignature),
          callback: base.callback,
          amount: msat,
          verified: true,
          mintPubkey: base.mintPubkey
        })
        const change = await addBearer({
          url: withNewK1(base.url, changeK1, sum - msat, changeSignature),
          callback: base.callback,
          amount: sum - msat,
          verified: false,
          mintPubkey: base.mintPubkey
        })
        for (const bearer of picked) removeBearer(bearer.id)
        targetAmount = msat
        changeAmount = sum - msat
        try {
          const settled = await settleNote(
            base.url,
            changeK1,
            sum - msat,
            changeSignature
          )
          changeAmount = settled.amountMsat
          await updateBearer(change.id, {
            url: withNewK1(
              base.url,
              settled.k1,
              settled.amountMsat,
              settled.signature
            ),
            callback: settled.callback,
            amount: settled.amountMsat,
            verified: true
          })
        } catch (err) {
          notify(
            `Geteilt, aber der Wechselgeld-Schein ist nicht fertig bestätigt (${(err as Error).message}) – er steht ungeprüft da; erneuern repariert ihn.`,
            NotifyKind.ERROR
          )
        }
      }
      setSelected(new Set<string>())
      const feeMsat = sum - msat - changeAmount
      const feeNote =
        feeMsat > 0
          ? ` ${msatToSats(feeMsat)} Sats Gebühr vom Wechselgeld abgezogen.`
          : ''
      logActivity(
        'split',
        `${picked.length} Scheine von ${server} zusammengelegt und geteilt in ${msatToSats(targetAmount)} + ${msatToSats(changeAmount)} Sats.${feeNote}`,
        base.label
      )
      notify(
        `Geteilt in ${msatToSats(targetAmount)} Sats und ${msatToSats(changeAmount)} Sats Wechselgeld.${feeNote}`,
        NotifyKind.SUCCESS
      )
      setShowSplitInput(false)
      setSplitSats('')
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setSplitting(false)
    }
  }

  // Fork: Reiter Scheine im Bild des Prototyps (roehren/Scheine.tsx) — die Arbeit tun die
  // Funktionen oben; die volle Werkzeugleiste des Originals ist die Scheine-Werkstatt
  // (Einstellungen › Erweitert) — im Reiter selbst war sie eine Falltür (Gerhard am Pixel)
  const nurDieser = (id: string) => setSelected(new Set([id]))
  const scheineMotor: ScheineMotor = {
    scheine: () => bearers().filter(b => !b.spent),
    vorgaenge,
    ausgewaehlt: selected,
    waehle: toggleSelect,
    leereAuswahl: () => setSelected(new Set<string>()),
    kannZusammenlegen: canCombine,
    arbeitet: () => splittingSingle() || combining() || refreshing(),
    // vorher: ist die Stelle erreichbar? danach: unklar geendet → als Vorgang festhalten (klaerung.ts)
    teilen: async (schein, sats, mal = 1) => {
      const host = serverOf(schein.url)
      if (!(await erreichbar(host)))
        return notify(nichtErreichbar(host), NotifyKind.ERROR)
      nurDieser(schein.id)
      setSplitSingleSats(String(sats))
      setSplitSingleTimes(String(mal))
      await beobachte('teilen', [schein], bearers, splitSingleSelected)
    },
    zusammenlegen: async () => {
      const eingang = selectedEligible()
      if (eingang.length === 0) return
      const host = serverOf(eingang[0].url)
      if (!(await erreichbar(host)))
        return notify(nichtErreichbar(host), NotifyKind.ERROR)
      await beobachte('zusammenlegen', eingang, bearers, combineSelected)
    },
    beschriften: (schein, text) => {
      nurDieser(schein.id)
      setLabelInputValue(text)
      saveLabelSelected()
    },
    erneuern: async schein => {
      await refreshOneBearer(schein)
    },
    // was früher nur die Werkstatt des Originals konnte (Gerhard: keine Design-Rücksprünge)
    umziehen: schein => setTransferSource(schein),
    anSchluessel: schein => setSendToPubkeySource([schein]),
    absicherbar: schein => {
      const k1 = noteK1(schein.url) || ''
      return !!k1 && !isCk1(k1) && !isCw1(k1) && !schein.deviceId
    },
    absichern: schein => upgradeOneBearer(schein),
    // eine einzige Änderung: markSpentSelected wartet updateBearer nicht ab, ein zweites updateBearer
    // las den alten Stand und schrieb spent wieder auf false — der markierte Schein blieb sichtbar
    // und „Zu prüfen“ leer (Gerhard am Pixel, 2026-10-12)
    markieren: async schein => {
      await updateBearer(schein.id, {spent: true, spentGrund: 'markiert'})
      if (schein.deviceId)
        await markDeviceNoteSpent(deviceClient(), schein.deviceId)
      logActivity(
        'spent',
        `${msatToSats(schein.amount)} Sats von ${serverOf(schein.url)} als ausgegeben markiert.`,
        schein.label
      )
    },
    ausgegebene: spentBearers,
    aufheben: schein => {
      updateBearer(schein.id, {spent: false, spentGrund: undefined})
      logActivity(
        'unspent',
        `Markierung aufgehoben: ${msatToSats(schein.amount)} Sats von ${serverOf(schein.url)}.`,
        schein.label
      )
    },
    ausgegebeneEntfernen: clearAllSpent,
    alleErneuern: refreshAllNotes,
    erneuertAlle: refreshingAll
  }

  return (
    <Show
      when={state() !== 'none'}
      fallback={
        <div id="wallet" class="page">
          <div class="setup-card">
            <h2>Auf diesem Gerät gibt es noch keine Wallet</h2>
            <p>
              Leg eine an oder stell sie mit deinen zwölf Wörtern wieder her.
            </p>
            <div class="btns">
              <A href="/setup" class="hero-btn hero-btn-primary">
                Wallet anlegen
              </A>
            </div>
          </div>
        </div>
      }
    >
      <Show
        when={state() === 'unlocked'}
        fallback={
          <div id="unlock" class="page">
            <div class="setup-card">
              <h2>Wallet entsperren</h2>
              <form onSubmit={unlockWallet}>
                <input
                  type="password"
                  placeholder="Passwort"
                  autocomplete="current-password"
                  autocapitalize="off"
                  spellcheck={false}
                  value={password()}
                  onInput={e => setPassword(e.currentTarget.value)}
                />
                <div class="btns">
                  <button type="submit" disabled={unlocking() || !password()}>
                    <Show when={unlocking()} fallback={<IoLockOpenSharp />}>
                      <IoRefreshSharp class="spin" />
                    </Show>
                    &nbsp;Entsperren
                  </button>
                </div>
              </form>
              <p>
                <A href="/passwort-vergessen">Passwort vergessen?</A>
              </p>
            </div>
          </div>
        }
      >
        {/* Fork: auch die leere Wallet ist die Startseite — Zählwerk mit kalter Null, dieselben
        Schalter (Steve, 2026-10-11). Das Plakat des Originals bleibt nur für den leeren Reiter Scheine. */}
        <Show
          when={bearers().length > 0 || !scheineAnsicht()}
          fallback={
            <div id="wallet" class="page">
              {/* Fork: leer wie die Startseite — kalte Null und der Weg zu Empfangen (Steve) */}
              <Scheine motor={scheineMotor} />
            </div>
          }
        >
          <div id="wallet" class="page">
            <Show when={confirmClearSpent()}>
              <Dialog onClose={() => setConfirmClearSpent(false)}>
                <>
                  <h4>Alle ausgegebenen Scheine entfernen</h4>
                  <p class="warning">
                    Clear all {spentCount()} spent note
                    {spentCount() === 1 ? '' : 's'} from the wallet? If any of
                    them turn out not to have actually been spent, those sats
                    are gone unless you saved them elsewhere.
                  </p>
                  <div class="btns">
                    <button onClick={clearAllSpent}>Alle entfernen</button>
                    <button onClick={() => setConfirmClearSpent(false)}>
                      Abbrechen
                    </button>
                  </div>
                </>
              </Dialog>
            </Show>
            <Show when={!scheineAnsicht()}>
              <section class="wallet-hero">
                {/* Fork: Guthaben im Röhren-Zählwerk statt "Total balance" (roehren/) */}
                <Zaehlwerk sats={Math.floor(sicherTotal() / 1000)}>
                  {/* Fork: Rückmeldung beim Einlösen eines gescannten/eingefügten Scheins — ohne sie
                sah man am Pixel nicht, ob der Scan angekommen war (Gerhard, 2026-10-11) */}
                  <Show when={heroReceiving()}>
                    <p class="rz-status">
                      <span class="rz-lampe-klein" /> Schein wird eingelöst …
                    </p>
                  </Show>
                  <Show when={vorgaenge().length > 0}>
                    <button
                      type="button"
                      class="rz-hinweiszeile"
                      onClick={() => navigate('/scheine')}
                    >
                      {vorgaenge().length === 1
                        ? '1 Vorgang wird geklärt'
                        : `${vorgaenge().length} Vorgänge werden geklärt`}{' '}
                      ›
                    </button>
                  </Show>
                  <Show when={pruefSummeFrei() > 0}>
                    <p class="rz-status">
                      <span class="rz-lampe-klein" /> +{' '}
                      {Math.floor(pruefSummeFrei() / 1000).toLocaleString(
                        'de-DE'
                      )}{' '}
                      Sats werden geprüft
                    </p>
                  </Show>
                  <Show when={unterwegsScheine().length > 0}>
                    <button
                      type="button"
                      class="rz-hinweiszeile"
                      onClick={() => navigate('/activity')}
                    >
                      {unterwegsScheine().length === 1
                        ? '1 Schein unterwegs'
                        : `${unterwegsScheine().length} Scheine unterwegs`}
                      {' · '}
                      {Math.floor(
                        unterwegsScheine().reduce((a, b) => a + b.amount, 0) /
                          1000
                      ).toLocaleString('de-DE')}{' '}
                      Sats ›
                    </button>
                  </Show>
                </Zaehlwerk>
                {/* Fork: statt Zählerzeile und fünf Knöpfen nur Senden/Empfangen (Steve, 2026-10-11) */}
                <Knoepfe
                  leer={spendableTotal() === 0}
                  onSenden={() => navigate('/senden')}
                  onEmpfangen={() => navigate('/empfangen')}
                />
                <Show when={blatt()}>
                  <Dialog onClose={() => setBlatt(null)}>
                    <div class="rz-blatt">
                      <Show
                        when={blatt() === 'senden'}
                        fallback={
                          <>
                            <h3>Empfangen</h3>
                            <p class="rz-hinweis">
                              Schein scannen oder einfügen — oder per Lightning
                              aufladen.
                            </p>
                          </>
                        }
                      >
                        <h3>Bezahlen</h3>
                        <p class="rz-hinweis">
                          Rechnung oder Lightning-Adresse scannen oder einfügen.
                        </p>
                      </Show>
                      <div class="paste-widget hero-paste-widget">
                        <div class="paste-input-row">
                          <ScanToggle
                            onScan={onHeroScan}
                            accept={isValidHeroInput}
                          />
                          <NfcToggle
                            onScan={onHeroScan}
                            accept={isValidHeroInput}
                          />
                          <button
                            type="button"
                            class="icon-btn paste-icon-btn"
                            title="Aus der Zwischenablage einfügen"
                            onClick={pasteHero}
                          >
                            <IoClipboardSharp />
                          </button>
                          <Show when={storeableMeltAddresses().length > 0}>
                            <button
                              type="button"
                              class="icon-btn paste-at-btn"
                              title="Gespeicherte Adresse bezahlen"
                              onClick={() => setShowSavedAddresses(true)}
                            >
                              <IoAtCircleSharp />
                            </button>
                          </Show>
                          <button
                            type="button"
                            class="icon-btn paste-keyboard-btn"
                            title="Stattdessen eintippen"
                            onClick={() => setShowHeroKeyboard(v => !v)}
                          >
                            <MdSharpKeyboard />
                          </button>
                          <div
                            class="paste-input-wrapper"
                            classList={{'mobile-open': showHeroKeyboard()}}
                          >
                            <input
                              ref={el => (heroPasteRef = el)}
                              type="text"
                              class="paste-input"
                              placeholder="Schein, Rechnung oder Lightning-Adresse …"
                              value={heroValue()}
                              onInput={e => setHeroValue(e.currentTarget.value)}
                              onKeyDown={e => e.key === 'Enter' && handleHero()}
                            />
                            <Show when={heroValue() !== ''}>
                              <button
                                type="button"
                                class="icon-btn paste-clear-btn"
                                title="Leeren"
                                onClick={() => setHeroValue('')}
                              >
                                <IoCloseSharp />
                              </button>
                            </Show>
                          </div>
                          <button
                            type="button"
                            class="icon-btn paste-confirm-btn"
                            classList={{'mobile-open': showHeroKeyboard()}}
                            title="Schein empfangen oder Rechnung/Adresse bezahlen"
                            disabled={heroValue() === '' || heroReceiving()}
                            onClick={handleHero}
                          >
                            <Show
                              when={heroReceiving()}
                              fallback={<IoReturnDownForwardSharp />}
                            >
                              <IoRefreshSharp class="spin" />
                            </Show>
                          </button>
                        </div>
                      </div>
                      <Show when={blatt() === 'empfangen'}>
                        <div class="rz-abschnitt">
                          <A href="/aufladen" class="link-btn wallet-hero-btn">
                            <IoAddCircleSharp />
                            &nbsp;Aufladen per Lightning
                          </A>
                        </div>
                      </Show>
                    </div>
                  </Dialog>
                </Show>
              </section>
            </Show>
            <Show when={showMelt()}>
              <MeltDialog
                initialInvoice={meltHandoffInvoice() ?? undefined}
                initialAddress={meltHandoffAddress() ?? undefined}
                onClose={closeMelt}
              />
            </Show>
            {savedAddressPicker()}

            {/* Fork: Werkzeugleiste und Scheine nur im Reiter „Scheine“ (Profi-Modus, Steve 2026-10-11) */}
            <Show when={scheineAnsicht()}>
              <Show
                when={werkstatt()}
                fallback={<Scheine motor={scheineMotor} />}
              >
                <div class="rz-seitenkopf">
                  <A
                    href="/settings"
                    class="rz-zurueck"
                    aria-label="Zurück zu den Einstellungen"
                  >
                    ‹
                  </A>
                  <h2>Scheine-Werkstatt</h2>
                </div>
                <p class="rz-hinweis">
                  Werkzeuge der Original-Wallet, teils englisch.
                </p>
              </Show>
            </Show>
            <Show when={werkstatt()}>
              <section class="list-controls">
                <div class="list-controls-row">
                  <Show
                    when={showSearch()}
                    fallback={
                      <button
                        type="button"
                        class="search-toggle-btn"
                        title="Scheine nach Ausgabestelle oder Betrag suchen"
                        onClick={() => setShowSearch(true)}
                      >
                        <IoSearchSharp />
                        <span class="btn-label">&nbsp;Suchen</span>
                      </button>
                    }
                  >
                    <div class="search-input-wrapper">
                      <IoSearchSharp />
                      <input
                        ref={el => {
                          searchInputRef = el
                          el.focus()
                        }}
                        type="text"
                        class="search-input"
                        placeholder="Ausgabestelle oder Betrag …"
                        value={searchQuery()}
                        onInput={e => setSearchQuery(e.currentTarget.value)}
                      />
                      <Show when={searchQuery() !== ''}>
                        <button
                          type="button"
                          class="icon-btn"
                          title="Suche leeren"
                          onClick={() => {
                            setSearchQuery('')
                            searchInputRef?.focus()
                          }}
                        >
                          <IoCloseSharp />
                        </button>
                      </Show>
                      <button
                        type="button"
                        class="icon-btn"
                        title="Suche schließen"
                        onClick={() => {
                          setShowSearch(false)
                          setSearchQuery('')
                        }}
                      >
                        <IoCloseCircleSharp />
                      </button>
                    </div>
                  </Show>
                  <div class="sort-menu" ref={el => (sortMenuRef = el)}>
                    <button
                      type="button"
                      class="sort-toggle-btn"
                      title={`Sort by ${sortKey()} (${sortDesc() ? 'descending' : 'ascending'})`}
                      onClick={() => setShowSortMenu(v => !v)}
                    >
                      <IoSwapVerticalSharp />
                      &nbsp;{sortKey() === 'amount' ? 'Amount' : 'Updated'}
                      &nbsp;
                      <Show when={sortDesc()} fallback={<IoArrowUpSharp />}>
                        <IoArrowDownSharp />
                      </Show>
                    </button>
                    <Show when={showSortMenu()}>
                      <div class="more-menu-panel">
                        <button
                          type="button"
                          classList={{active: sortKey() === 'amount'}}
                          onClick={() => {
                            toggleSort('amount')
                            setShowSortMenu(false)
                          }}
                        >
                          Betrag
                          <Show when={sortKey() === 'amount'}>
                            &nbsp;
                            <Show
                              when={sortDesc()}
                              fallback={<IoArrowUpSharp />}
                            >
                              <IoArrowDownSharp />
                            </Show>
                          </Show>
                        </button>
                        <button
                          type="button"
                          classList={{active: sortKey() === 'updated'}}
                          onClick={() => {
                            toggleSort('updated')
                            setShowSortMenu(false)
                          }}
                        >
                          Zuletzt
                          <Show when={sortKey() === 'updated'}>
                            &nbsp;
                            <Show
                              when={sortDesc()}
                              fallback={<IoArrowUpSharp />}
                            >
                              <IoArrowDownSharp />
                            </Show>
                          </Show>
                        </button>
                      </div>
                    </Show>
                  </div>
                  <Show when={spentCount() > 0}>
                    <button
                      type="button"
                      class="spent-btn"
                      classList={{active: showSpent()}}
                      title="Ausgegebene Scheine sind hier gesperrt (bezahlt oder von Hand markiert) – das blendet sie nur ein oder aus, an ihnen ändert sich nichts"
                      onClick={() => setShowSpent(v => !v)}
                    >
                      <IoBanSharp />
                      <span class="btn-label">&nbsp;Ausgegeben</span>
                      <Show when={!showSpent()}>&nbsp;({spentCount()})</Show>
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="group-btn"
                    classList={{active: groupByMint()}}
                    title="Scheine nach Ausgabestelle gruppieren statt als eine Liste"
                    onClick={() => setGroupByMint(!groupByMint())}
                  >
                    <IoLayersSharp />
                    <span class="btn-label">&nbsp;Gruppieren</span>
                  </button>
                  <Show when={availableTags().length > 0}>
                    <div class="more-menu" ref={el => (tagMenuRef = el)}>
                      <button
                        type="button"
                        class="icon-btn list-more-btn"
                        classList={{active: selectedTags().size > 0}}
                        title={
                          selectedTags().size > 0
                            ? `Filtering by ${selectedTags().size} tag${selectedTags().size === 1 ? '' : 's'} - click to change`
                            : 'Nach Markierung filtern'
                        }
                        onClick={() => setShowTagMenu(v => !v)}
                      >
                        <IoPricetagsSharp />
                      </button>
                      <Show when={showTagMenu()}>
                        <div class="more-menu-panel tag-menu-panel">
                          <For each={availableTags()}>
                            {tag => (
                              <button
                                type="button"
                                classList={{active: selectedTags().has(tag)}}
                                onClick={() => toggleTag(tag)}
                              >
                                {decodeTag(tag)}
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </Show>
                  <div class="more-menu" ref={el => (listMoreMenuRef = el)}>
                    <button
                      type="button"
                      class="icon-btn list-more-btn"
                      title="Weitere Aktionen – alle erneuern, ausgegebene entfernen"
                      onClick={() => setShowListMoreMenu(v => !v)}
                    >
                      <IoEllipsisVerticalSharp />
                    </button>
                    <Show when={showListMoreMenu()}>
                      <div class="more-menu-panel">
                        <button
                          type="button"
                          disabled={
                            refreshingAll() ||
                            offlineMode() ||
                            spendableBearers().length === 0
                          }
                          title={
                            offlineMode()
                              ? 'Offline-Modus ist an'
                              : 'Alle nicht ausgegebenen Scheine nacheinander erneuern'
                          }
                          onClick={() => {
                            refreshAllNotes()
                            setShowListMoreMenu(false)
                          }}
                        >
                          <Show
                            when={refreshingAll()}
                            fallback={<IoRefreshSharp />}
                          >
                            <IoRefreshSharp class="spin" />
                          </Show>
                          &nbsp;Alle erneuern
                        </button>
                        <Show when={spentCount() > 0}>
                          <button
                            type="button"
                            title={`Clear all ${spentCount()} spent note${spentCount() === 1 ? '' : 's'} from the wallet`}
                            onClick={() => {
                              setConfirmClearSpent(true)
                              setShowListMoreMenu(false)
                            }}
                          >
                            <IoTrashSharp />
                            &nbsp;Ausgegebene entfernen
                          </button>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </div>
              </section>

              <Show when={selected().size > 0}>
                <section class="selection-toolbar">
                  <div class="btns">
                    <button
                      class="icon-btn refresh-btn"
                      disabled={
                        !canRefreshSelected() || refreshing() || offlineMode()
                      }
                      title={
                        offlineMode()
                          ? 'Offline-Modus ist an'
                          : canRefreshSelected()
                            ? 'Aktuellen Wert bei der Ausgabestelle abfragen, dann erneuern – nacheinander für jeden ausgewählten Schein'
                            : 'Scheine zum Erneuern auswählen'
                      }
                      onClick={refreshSelected}
                    >
                      <Show when={refreshing()} fallback={<IoRefreshSharp />}>
                        <IoRefreshSharp class="spin" />
                      </Show>
                      <span class="btn-label">
                        &nbsp;Erneuern
                        <Show when={selectedBearers().length > 1}>
                          &nbsp;({selectedBearers().length})
                        </Show>
                      </span>
                    </button>
                    <button
                      class="icon-btn split-single-btn"
                      disabled={!canSplitSingle() || offlineMode()}
                      title={
                        offlineMode()
                          ? 'Offline-Modus ist an'
                          : canSplitSingle()
                            ? 'Ausgewählten Schein in zwei teilen'
                            : 'Genau 1 geprüften, nicht ausgegebenen Schein zum Teilen auswählen'
                      }
                      onClick={() => setShowSplitSingleInput(v => !v)}
                    >
                      <IoGitBranchSharp />
                      <span class="btn-label">&nbsp;Teilen</span>
                    </button>
                    <button
                      class="icon-btn combine-btn"
                      disabled={!canCombine() || combining() || offlineMode()}
                      title={
                        offlineMode()
                          ? 'Offline-Modus ist an'
                          : canCombine()
                            ? 'Ausgewählte Scheine zu einem zusammenlegen. Verlangt die Ausgabestelle Gebühren, bekommst du beim Zusammenlegen alle bis auf eine Grundgebühr zurück.'
                            : 'Mindestens 2 geprüfte, nicht ausgegebene Scheine derselben Ausgabestelle auswählen'
                      }
                      onClick={combineSelected}
                    >
                      <Show when={combining()} fallback={<IoGitMergeSharp />}>
                        <IoRefreshSharp class="spin" />
                      </Show>
                      <span class="btn-label">&nbsp;Zusammenlegen</span>
                    </button>
                    <button
                      class="icon-btn split-btn"
                      disabled={!canCombine() || splitting() || offlineMode()}
                      title={
                        offlineMode()
                          ? 'Offline-Modus ist an'
                          : canCombine()
                            ? 'Ausgewählte Scheine zusammenlegen und einen Betrag abteilen, der Rest bleibt als Wechselgeld. Verlangt die Ausgabestelle Gebühren, bekommst du alle bis auf eine Grundgebühr zurück.'
                            : 'Mindestens 2 geprüfte, nicht ausgegebene Scheine derselben Ausgabestelle auswählen'
                      }
                      onClick={() => setShowSplitInput(v => !v)}
                    >
                      <Show when={splitting()} fallback={<IoGitBranchSharp />}>
                        <IoRefreshSharp class="spin" />
                      </Show>
                      <span class="btn-label">
                        &nbsp;Zusammenlegen &amp; teilen
                      </span>
                    </button>
                    <label
                      class="plain-secret-toggle"
                      title="Beim Teilen/Zusammenlegen Zufallsgeheimnisse statt aus den zwölf Wörtern abgeleiteter Schlüssel verwenden – nicht mit den Wörtern wiederherstellbar"
                    >
                      <input
                        type="checkbox"
                        checked={plainSecret()}
                        onChange={e => setPlainSecret(e.currentTarget.checked)}
                      />
                      &nbsp;Zufallsgeheimnis
                    </label>
                    <button
                      class="icon-btn transfer-btn"
                      disabled={!canTransfer() || offlineMode()}
                      title={
                        offlineMode()
                          ? 'Offline-Modus ist an'
                          : canTransfer()
                            ? 'Ausgewählten Schein zu einer anderen Ausgabestelle umziehen'
                            : 'Genau 1 Schein zum Umziehen auswählen'
                      }
                      onClick={() => setTransferSource(selectedEligible()[0])}
                    >
                      <IoSwapHorizontalSharp />
                      <span class="btn-label">&nbsp;Umziehen</span>
                    </button>
                    <div class="more-menu" ref={el => (moreMenuRef = el)}>
                      <button
                        type="button"
                        class="icon-btn more-btn"
                        title="Weitere Aktionen – Bezeichnung, als ausgegeben markieren, exportieren"
                        onClick={() => setShowMoreMenu(v => !v)}
                      >
                        <IoEllipsisVerticalSharp />
                      </button>
                      <Show when={showMoreMenu()}>
                        <div class="more-menu-panel">
                          <button
                            class="icon-btn send-pubkey-btn"
                            disabled={!canSendToPubkey() || offlineMode()}
                            title={
                              offlineMode()
                                ? 'Offline-Modus ist an'
                                : canSendToPubkey()
                                  ? 'Ausgewählte Scheine zusammenlegen und/oder teilen – zu einem Schein für einen eingefügten cp1-Pubkey'
                                  : 'Mindestens 1 geprüften, nicht ausgegebenen Schein (nicht auf dem Tresor) derselben Ausgabestelle auswählen'
                            }
                            onClick={() => {
                              setSendToPubkeySource(selectedEligible())
                              setShowMoreMenu(false)
                            }}
                          >
                            <IoKeySharp />
                            &nbsp;An Pubkey senden
                            <Show when={selectedEligible().length > 1}>
                              &nbsp;({selectedEligible().length})
                            </Show>
                          </button>
                          <button
                            class="icon-btn label-btn"
                            disabled={!canLabelSelected()}
                            title={
                              canLabelSelected()
                                ? 'Ausgewählten Scheinen eine Bezeichnung geben (nur für dich)'
                                : 'Scheine zum Bezeichnen auswählen'
                            }
                            onClick={() => {
                              openLabelInput()
                              setShowMoreMenu(false)
                            }}
                          >
                            <IoPencilSharp />
                            &nbsp;Bezeichnung
                            <Show when={selectedBearers().length > 1}>
                              &nbsp;({selectedBearers().length})
                            </Show>
                          </button>
                          <button
                            class="icon-btn mark-spent-btn"
                            disabled={!canMarkSpentSelected()}
                            title={
                              canMarkSpentSelected()
                                ? 'Ausgewählte Scheine als ausgegeben markieren – sperrt sie, ohne sie zu löschen, z. B. wenn du sie anders weitergegeben hast'
                                : 'Scheine zum Markieren auswählen'
                            }
                            onClick={() => {
                              markSpentSelected()
                              setShowMoreMenu(false)
                            }}
                          >
                            <IoBanSharp />
                            &nbsp;Als ausgegeben markieren
                            <Show when={selectedBearers().length > 1}>
                              &nbsp;({selectedBearers().length})
                            </Show>
                          </button>
                          <button
                            class="icon-btn export-btn"
                            disabled={selected().size === 0}
                            title={
                              selected().size === 0
                                ? 'Scheine zum Exportieren auswählen'
                                : 'Ausgewählte Scheine als Textdatei herunterladen (bech32, einer je Zeile)'
                            }
                            onClick={() => {
                              exportSelected()
                              setShowMoreMenu(false)
                            }}
                          >
                            <IoDownloadSharp />
                            &nbsp;Exportieren
                            <Show when={selected().size > 0}>
                              &nbsp;({selected().size})
                            </Show>
                          </button>
                          <button
                            class="icon-btn qr-export-btn"
                            disabled={selected().size === 0}
                            title={
                              selected().size === 0
                                ? 'Scheine für QR-Codes auswählen'
                                : 'Für jeden ausgewählten Schein einen QR-Code (SVG) herunterladen'
                            }
                            onClick={() => {
                              downloadQrSelected()
                              setShowMoreMenu(false)
                            }}
                          >
                            <IoQrCodeSharp />
                            &nbsp;QR
                            <Show when={selected().size > 0}>
                              &nbsp;({selected().size})
                            </Show>
                          </button>
                        </div>
                      </Show>
                    </div>
                    <Show when={selected().size > 0}>
                      <button
                        type="button"
                        class="icon-btn clear-selection-btn"
                        title="Auswahl aufheben"
                        onClick={() => setSelected(new Set<string>())}
                      >
                        <IoCloseCircleSharp />
                        <span class="btn-label">&nbsp;Auswahl aufheben</span>
                        &nbsp;({selected().size})
                      </button>
                    </Show>
                  </div>
                  <Show when={showSplitInput() && canCombine()}>
                    <Dialog
                      onClose={() => {
                        setShowSplitInput(false)
                        setSplitSats('')
                      }}
                    >
                      <h4>Zusammenlegen &amp; teilen</h4>
                      <label>
                        Split off (sats, of{' '}
                        {msatToSats(
                          selectedEligible().reduce((s, b) => s + b.amount, 0)
                        )}
                        )
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Betrag in Sats"
                        value={splitSats()}
                        onInput={e => setSplitSats(e.currentTarget.value)}
                      />
                      <p class="bearer-hint">
                        Burns the {selectedEligible().length} selected notes and
                        mints two: this amount, and a change note for the rest.
                        If this mint charges a fee, it's deducted from the
                        change, not the amount split off.
                      </p>
                      <label
                        class="plain-secret-toggle"
                        title="Beim Teilen/Zusammenlegen Zufallsgeheimnisse statt aus den zwölf Wörtern abgeleiteter Schlüssel verwenden – nicht mit den Wörtern wiederherstellbar"
                      >
                        <input
                          type="checkbox"
                          checked={plainSecret()}
                          onChange={e =>
                            setPlainSecret(e.currentTarget.checked)
                          }
                        />
                        &nbsp;Zufallsgeheimnis
                      </label>
                      <div class="btns">
                        <button
                          disabled={splitting() || offlineMode()}
                          onClick={combineAndSplit}
                        >
                          <Show when={splitting()}>
                            <IoRefreshSharp class="spin" />
                            &nbsp;
                          </Show>
                          Teilen
                        </button>
                        <button
                          onClick={() => {
                            setShowSplitInput(false)
                            setSplitSats('')
                          }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </Dialog>
                  </Show>
                  <Show when={showLabelInput() && canLabelSelected()}>
                    <Dialog
                      onClose={() => {
                        setShowLabelInput(false)
                        setLabelInputValue('')
                      }}
                    >
                      <h4>Bezeichnung</h4>
                      <label>
                        Label {selectedBearers().length} note
                        {selectedBearers().length === 1 ? '' : 's'} (private,
                        for your own reference)
                      </label>
                      <input
                        type="text"
                        placeholder="z. B. Miete, Geschenk für Alex"
                        value={labelInputValue()}
                        onInput={e => setLabelInputValue(e.currentTarget.value)}
                        onKeyDown={e =>
                          e.key === 'Enter' && saveLabelSelected()
                        }
                      />
                      <div class="btns">
                        <button onClick={saveLabelSelected}>Speichern</button>
                        <button
                          onClick={() => {
                            setShowLabelInput(false)
                            setLabelInputValue('')
                          }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </Dialog>
                  </Show>
                  <Show when={showSplitSingleInput() && canSplitSingle()}>
                    <Dialog
                      onClose={() => {
                        setShowSplitSingleInput(false)
                        setSplitSingleSats('')
                        setSplitSingleTimes('1')
                      }}
                    >
                      <h4>Teilen</h4>
                      <label>
                        Split off (sats, of{' '}
                        {msatToSats(selectedBearers()[0].amount)})
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Betrag in Sats"
                        value={splitSingleSats()}
                        onInput={e => setSplitSingleSats(e.currentTarget.value)}
                      />
                      <label>Wie oft</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="1"
                        value={splitSingleTimes()}
                        onInput={e =>
                          setSplitSingleTimes(e.currentTarget.value)
                        }
                      />
                      <p class="bearer-hint">
                        Verlangt die Ausgabestelle eine Gebühr, geht sie vom
                        Rest ab, nicht vom abgeteilten Betrag – bleibt dafür zu
                        wenig übrig, schlägt das Teilen fehl.
                      </p>
                      <Show when={Number(splitSingleTimes()) > 1}>
                        <p class="bearer-hint">
                          Chains {Number(splitSingleTimes())} split requests one
                          after another - if one fails partway through,
                          whichever notes already came back are kept, and you'd
                          need to try again for the rest.
                        </p>
                      </Show>
                      <label
                        class="plain-secret-toggle"
                        title="Beim Teilen/Zusammenlegen Zufallsgeheimnisse statt aus den zwölf Wörtern abgeleiteter Schlüssel verwenden – nicht mit den Wörtern wiederherstellbar"
                      >
                        <input
                          type="checkbox"
                          checked={plainSecret()}
                          onChange={e =>
                            setPlainSecret(e.currentTarget.checked)
                          }
                        />
                        &nbsp;Zufallsgeheimnis
                      </label>
                      <div class="btns">
                        <button
                          disabled={splittingSingle() || offlineMode()}
                          onClick={splitSingleSelected}
                        >
                          <Show when={splittingSingle()}>
                            <IoRefreshSharp class="spin" />
                            &nbsp;
                          </Show>
                          Teilen
                        </button>
                        <button
                          onClick={() => {
                            setShowSplitSingleInput(false)
                            setSplitSingleSats('')
                            setSplitSingleTimes('1')
                          }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </Dialog>
                  </Show>
                </section>
              </Show>

              <Show
                when={groupByMint()}
                fallback={
                  <div class="bearer-list">
                    <For each={sortedBearers()}>
                      {bearer => (
                        <BearerCard
                          bearer={bearer}
                          selected={selected().has(bearer.id)}
                          onSelect={isSelected =>
                            toggleSelect(bearer.id, isSelected)
                          }
                          onRefresh={refreshOneBearer}
                          onUpgrade={upgradeOneBearer}
                        />
                      )}
                    </For>
                  </div>
                }
              >
                <For each={groupedBearers()}>
                  {([server, group]) => (
                    <section class="mint-group-section">
                      <h4 class="mint-group-heading">{server}</h4>
                      <div class="bearer-list">
                        <For each={group}>
                          {bearer => (
                            <BearerCard
                              bearer={bearer}
                              selected={selected().has(bearer.id)}
                              onSelect={isSelected =>
                                toggleSelect(bearer.id, isSelected)
                              }
                              onRefresh={refreshOneBearer}
                              onUpgrade={upgradeOneBearer}
                            />
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
              </Show>
            </Show>
          </div>
        </Show>
      </Show>
      <Show when={transferSource()}>
        {bearer => (
          <TransferDialog
            sourceBearer={bearer()}
            onClose={() => {
              setTransferSource(null)
              setSelected(new Set<string>())
            }}
          />
        )}
      </Show>
      <Show when={sendToPubkeySource()}>
        {picked => (
          <SendToPubkeyDialog
            bearers={picked()}
            onClose={() => {
              setSendToPubkeySource(null)
              setSelected(new Set<string>())
            }}
          />
        )}
      </Show>
    </Show>
  )
}
export default Wallet
