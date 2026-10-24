import type {Component} from 'solid-js'
import {
  Show,
  For,
  Switch,
  Match,
  createSignal,
  createMemo,
  onCleanup
} from 'solid-js'
import {useNavigate} from '@solidjs/router'

import type {Bearer} from '../storage'
import {useWallet} from '../WalletContext'
import {useDevice} from '../DeviceContext'
import type {MintFee, PayRequestInfo} from '../lnurlcash'
import {
  resolveMintInput,
  fetchPayRequest,
  fetchInvoiceVerification,
  buildNoteUrl,
  withNewK1,
  fetchNoteInfo,
  rotateNote,
  meltNote,
  requireNoteK1,
  serverOf,
  serviceOriginOf,
  noteEndpointOf,
  isPreimage,
  isCk1,
  applyMintFee,
  probeBurnedNote,
  sameInvoice,
  requestInvoice,
  requestMintInvoice,
  requireMintComment,
  PendingNoteError,
  AmbiguousMutationError
} from '../lnurlcash'
import {
  deviceMeltRequest,
  deviceMint,
  markDeviceNoteSpent,
  requireDeviceClient
} from '../deviceOrchestration'
import {notify, NotifyKind, msatToSats, floorMsatToSat} from '../helpers'
import {isMintTrusted, addTrustedMint, trustedMints} from '../trustedMints'
import {offlineMode} from '../offlineMode'
import Dialog from './Dialog'
import {PFADE, Schein, Werkzeug} from '../roehren/Scheine'
import {bekannteStellen, VORSCHLAG} from '../roehren/vorschlaege'

export type TransferDialogProps = {
  sourceBearer: Bearer
  onClose: () => void
}

// same cadence as Mint.tsx's LUD-21 verify poll and MeltDialog.tsx's pending-melt
// poll - this is really both of those chained together
const TRANSFER_POLL_SECONDS = 5

// moves a note's value to a different mint - there's no such primitive in
// the protocol itself, only melt (burn + pay an invoice) and minting (pay a
// payRequest bound to a fresh wallet-chosen k1). So a "transfer" here is:
// request an invoice from the destination for exactly this note's value,
// melt the source note to pay it (this wallet IS the payer, funded by the
// note instead of an external wallet), then claim the destination note once
// its invoice settles - via the destination's own LUD-21 verify if it has
// one, same as Mint.tsx's own payment flow, since we're in exactly the
// position that convenience is meant for (the legitimate payer checking on
// its own payment, not a third party snooping the verify endpoint).
//
// A destination that is someone's registered Lightning Address (its
// payRequest advertises a LUD-25 `text/cpub`) is a payment rather than a
// move: that address's mint always auto-mints onto the owner's own branch
// and ignores any comment, so the invoice is requested without one and
// there is no destination note for this wallet to claim - the transfer is
// done once the payment is confirmed.
const TransferDialog: Component<TransferDialogProps> = props => {
  const {bearers, addBearer, updateBearer, logActivity} = useWallet()
  const {client: deviceClient} = useDevice()
  const navigate = useNavigate()

  const [mintInput, setMintInput] = createSignal('')
  const [payRequest, setPayRequest] = createSignal<PayRequestInfo | null>(null)
  const [pendingTrust, setPendingTrust] = createSignal<{
    server: string
    mintPubkey: string
    info: PayRequestInfo
  } | null>(null)
  const [busy, setBusy] = createSignal(false)

  const [invoice, setInvoice] = createSignal<string | null>(null)
  const [verifyUrl, setVerifyUrl] = createSignal<string | null>(null)
  // The wallet-chosen destination k1. It is null before an invoice exists;
  // current transfer creation refuses an unnamed destination quote.
  const [mintSecret, setMintSecret] = createSignal<string | null>(null)
  const [claimed, setClaimed] = createSignal(false)
  const [sourceConfirmed, setSourceConfirmed] = createSignal(false)

  const [secondsLeft, setSecondsLeft] = createSignal(TRANSFER_POLL_SECONDS)
  const [checking, setChecking] = createSignal(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  const sourceK1 = () => requireNoteK1(props.sourceBearer.url)

  const payingAddress = createMemo(
    () => payRequest()?.internalTransfer !== undefined
  )

  const lookup = async () => {
    const url = resolveMintInput(mintInput())
    if (!url) {
      notify(
        'Gib eine Ausgabestelle oder Lightning-Adresse ein.',
        NotifyKind.ERROR
      )
      return
    }
    setPendingTrust(null)
    setBusy(true)
    try {
      const info = await fetchPayRequest(url)
      if (!info.withdrawLink) {
        notify(
          'Dort gibt es keine Scheine (LNURLcash) — das ist keine Ausgabestelle.',
          NotifyKind.ERROR
        )
        return
      }
      const server = serverOf(info.withdrawLink)
      const origin = serviceOriginOf(info.withdrawLink)
      if (origin === serviceOriginOf(props.sourceBearer.url)) {
        notify('Da liegt der Schein schon.', NotifyKind.ERROR)
        return
      }
      if (
        props.sourceBearer.amount < info.minSendable ||
        props.sourceBearer.amount > info.maxSendable
      ) {
        notify(
          `${server} nimmt nur ${msatToSats(info.minSendable)} bis ${msatToSats(info.maxSendable)} Sats — dieser Schein hat ${msatToSats(props.sourceBearer.amount)}.`,
          NotifyKind.ERROR
        )
        return
      }
      if (
        serviceOriginOf(url) === origin &&
        info.mintPubkey &&
        !isMintTrusted(origin)
      ) {
        setPendingTrust({server: origin, mintPubkey: info.mintPubkey, info})
        return
      }
      setPayRequest(info)
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setBusy(false)
    }
  }

  const selectMint = (address: string) => {
    setMintInput(address)
    lookup()
  }

  const confirmTrust = () => {
    const pending = pendingTrust()
    if (!pending) return
    addTrustedMint(pending.server, pending.mintPubkey)
    setPendingTrust(null)
    setPayRequest(pending.info)
  }

  const cancelTrust = () => {
    setPendingTrust(null)
    notify(
      'Abgebrochen — der Ausgabestelle wird nicht vertraut.',
      NotifyKind.ERROR
    )
  }

  // `payRequest() && !pendingTrust()` would return the boolean from the
  // `&&`, not the PayRequestInfo - this narrows properly so the Show below
  // can hand its children the actual object
  const readyPayRequest = createMemo(() =>
    !pendingTrust() ? payRequest() : null
  )

  // meltNote pays `pr` of exactly the note's value, so unlike Mint.tsx
  // there's no invoice amount to gross up here - the destination is always
  // invoiced for the full source amount. What its mint fee (if any) does
  // instead is shrink the note that comes out the other end, which this
  // estimates so the payer isn't surprised (the authoritative value is
  // whatever the destination's informational GET reports once claimed).
  // Floored to a whole sat, same as every other fee-adjusted estimate (see
  // helpers.ts's floorMsatToSat) - a mint fee's percentage cut can leave
  // sub-sat precision, and rounding that up here would display a note
  // value bigger than what actually comes out the other end
  const expectedNet = createMemo(() => {
    const info = payRequest()
    return info?.mintFee
      ? floorMsatToSat(applyMintFee(props.sourceBearer.amount, info.mintFee))
      : props.sourceBearer.amount
  })

  // fires the transfer: get an invoice for exactly the note's value, then
  // melt the note to pay it - the source is locked as spent immediately,
  // same as any other melt, and confirmed (or restored) by polling below
  const startTransfer = async () => {
    const info = payRequest()
    if (!info?.withdrawLink) return
    setBusy(true)
    try {
      let result
      if (payingAddress()) {
        // the owner's mint derives the output from their advertised cpub -
        // a comment is at most optional there and never names the output
        result = await requestInvoice(info, props.sourceBearer.amount)
      } else {
        // Refuse before requesting the destination invoice or spending the
        // source note unless the output can be bound to our own secret.
        requireMintComment(info)
        const minted = await requestMintInvoice(
          info,
          props.sourceBearer.amount,
          serverOf(info.withdrawLink || info.callback)
        )
        setMintSecret(minted.secret)
        result = minted.result
      }
      if (props.sourceBearer.deviceId) {
        await deviceMeltRequest(
          requireDeviceClient(deviceClient()),
          props.sourceBearer.deviceId,
          props.sourceBearer.callback,
          result.pr
        )
      } else {
        await meltNote(props.sourceBearer.callback, sourceK1(), result.pr)
      }
      await updateBearer(props.sourceBearer.id, {spent: true})
      setInvoice(result.pr)
      if (result.verify) setVerifyUrl(result.verify)
      // neither a verify endpoint nor a rotate probe (see checkTransfer)
      // can confirm a device-backed payment - the accepted melt is all
      // there is to go on
      if (payingAddress() && !result.verify && props.sourceBearer.deviceId) {
        await finishAddressPayment()
        return
      }
      notify('Der Schein zieht um …', NotifyKind.LOADING)
      startPolling()
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setBusy(false)
    }
  }

  // Claims the destination note with the wallet-generated secret from
  // startTransfer. Same claim sequence as Mint.tsx:
  // verify (also settling the k1), rotate to close the exposure that GET
  // just created, then store it. If a vault is connected, that fresh secret
  // is generated and held there instead of in this browser (deviceMint -
  // import then rotate).
  const claimDestination = async (noteSecret: string) => {
    const info = payRequest()
    if (!info?.withdrawLink) return
    if (!isPreimage(noteSecret) && !isCk1(noteSecret)) return
    try {
      const declaredUrl = buildNoteUrl(
        info.withdrawLink,
        noteSecret,
        props.sourceBearer.amount
      )
      const noteInfo = await fetchNoteInfo(declaredUrl)

      // LUD-25: same reasoning as Mint.tsx's claim() - this note's
      // bearer secret already proves key ownership (no rotate-for-a-
      // certificate needed, and rotating would silently downgrade it back
      // to a legacy secret), and the hardware vault has not been migrated
      // to pubkey-based notes yet, so this always stays browser-only.
      if (isCk1(noteSecret)) {
        const url = buildNoteUrl(
          info.withdrawLink,
          noteSecret,
          noteInfo.maxWithdrawable
        )
        await addBearer({
          url,
          callback: noteInfo.callback,
          amount: noteInfo.maxWithdrawable,
          verified: true,
          mintPubkey: noteInfo.mintPubkey
        })
        setClaimed(true)
        stopPolling()
        if (props.sourceBearer.deviceId) {
          await markDeviceNoteSpent(deviceClient(), props.sourceBearer.deviceId)
        }
        logActivity(
          'transfer',
          `Transferred ${msatToSats(noteInfo.maxWithdrawable)} sats from ${serverOf(props.sourceBearer.url)} to ${serverOf(url)}.`,
          props.sourceBearer.label
        )
        notify(
          `${msatToSats(noteInfo.maxWithdrawable)} Sats sind zu ${serverOf(url)} umgezogen.`,
          NotifyKind.SUCCESS
        )
        navigate('/wallet')
        props.onClose()
        return
      }

      const client = deviceClient()
      if (client) {
        const result = await deviceMint(
          client,
          info.withdrawLink,
          noteInfo.callback,
          noteEndpointOf(info.withdrawLink),
          noteSecret,
          noteInfo.maxWithdrawable
        )
        await addBearer({
          url: result.url,
          callback: result.callback,
          amount: result.amountMsat,
          verified: true,
          mintPubkey: noteInfo.mintPubkey,
          deviceId: result.deviceId,
          deviceHash: result.deviceHash
        })
        setClaimed(true)
        stopPolling()
        // the source note's melt is what paid for this claim - retire its
        // device copy at the same moment (queued for the next connect if
        // the vault isn't attached right now)
        if (props.sourceBearer.deviceId) {
          await markDeviceNoteSpent(deviceClient(), props.sourceBearer.deviceId)
        }
        logActivity(
          'transfer',
          `Transferred ${msatToSats(result.amountMsat)} sats from ${serverOf(props.sourceBearer.url)} to ${serverOf(result.url)}.`,
          props.sourceBearer.label
        )
        notify(
          `${msatToSats(result.amountMsat)} Sats sind zu ${serverOf(result.url)} umgezogen.`,
          NotifyKind.SUCCESS
        )
        navigate('/wallet')
        props.onClose()
        return
      }

      const mintPubkey = noteInfo.mintPubkey
      let url = withNewK1(
        declaredUrl,
        noteInfo.k1,
        noteInfo.maxWithdrawable,
        noteInfo.c
      )
      let rotationError: string | null = null
      // SERVICE may already disclose this note's offline-verification
      // certificate right on this informational GET (see
      // WithdrawRequestInfo's own comment) - skip the rotate entirely when
      // it's already there, same as Mint.tsx's own claim().
      if (!noteInfo.c) {
        try {
          const rotated = await rotateNote(noteInfo.callback, noteInfo.k1)
          url = withNewK1(
            declaredUrl,
            rotated.k1,
            noteInfo.maxWithdrawable,
            rotated.signature
          )
        } catch (err) {
          if (err instanceof AmbiguousMutationError) {
            // the rotate request may have landed despite the failure - the
            // fresh secret it carried is then the only copy of this note
            const outcome = await probeBurnedNote(url)
            if (outcome === 'gone') {
              // the burn landed - adopt the fresh secret as the note
              url = withNewK1(
                declaredUrl,
                err.newSecrets[0],
                noteInfo.maxWithdrawable
              )
            } else if (outcome === 'unknown') {
              // can't tell: the original note is stored below either way -
              // track the possible rotated copy alongside it
              await addBearer({
                url: withNewK1(
                  declaredUrl,
                  err.newSecrets[0],
                  noteInfo.maxWithdrawable
                ),
                callback: noteInfo.callback,
                amount: noteInfo.maxWithdrawable,
                verified: false,
                mintPubkey
              })
              rotationError = `${(err as Error).message} The rotation may still have gone through - the possible rotated copy is stored unverified alongside this one; refresh both to reconcile.`
            } else {
              rotationError = (err as Error).message
            }
          } else {
            rotationError = (err as Error).message
          }
        }
      }
      await addBearer({
        url,
        callback: noteInfo.callback,
        amount: noteInfo.maxWithdrawable,
        verified: true,
        mintPubkey
      })
      setClaimed(true)
      stopPolling()
      // the source note's melt is what paid for this claim - retire its
      // device copy at the same moment (queued for the next connect if the
      // vault isn't attached right now)
      if (props.sourceBearer.deviceId) {
        await markDeviceNoteSpent(deviceClient(), props.sourceBearer.deviceId)
      }
      logActivity(
        'transfer',
        `Transferred ${msatToSats(noteInfo.maxWithdrawable)} sats from ${serverOf(props.sourceBearer.url)} to ${serverOf(url)}.`,
        props.sourceBearer.label
      )
      // one toast, not two - the note landed either way, so a failed
      // rotate is folded into the same message rather than shown
      // separately from the transfer it's actually part of
      if (rotationError) {
        notify(
          `${msatToSats(noteInfo.maxWithdrawable)} Sats sind bei ${serverOf(url)} angekommen, aber der Schein ließ sich nicht erneuern (${rotationError}) — behandle ihn als bekannt und gib ihn bald weiter.`,
          NotifyKind.ERROR
        )
      } else {
        notify(
          `${msatToSats(noteInfo.maxWithdrawable)} Sats sind zu ${serverOf(url)} umgezogen.`,
          NotifyKind.SUCCESS
        )
      }
      navigate('/wallet')
      props.onClose()
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    }
  }

  // a payment to a Lightning Address has nothing to claim: once it's
  // confirmed (destination settled, or the source note burned) it's done
  const finishAddressPayment = async () => {
    setClaimed(true)
    stopPolling()
    if (props.sourceBearer.deviceId) {
      await markDeviceNoteSpent(deviceClient(), props.sourceBearer.deviceId)
    }
    const address = mintInput().trim()
    logActivity(
      'transfer',
      `Sent ${msatToSats(props.sourceBearer.amount)} sats from ${serverOf(props.sourceBearer.url)} to ${address}.`,
      props.sourceBearer.label
    )
    notify(
      `${msatToSats(props.sourceBearer.amount)} Sats an ${address} gesendet.`,
      NotifyKind.SUCCESS
    )
    navigate('/wallet')
    props.onClose()
  }

  // once claimed, or once there's neither a destination verify endpoint to
  // poll NOR an unconfirmed source left to rotate-probe, a tick of
  // checkTransfer has nothing left it can do - the destination side is
  // either resolved or waiting for a manual claim with the wallet-held
  // secret, and the source side already got its answer.
  // Without this, the button/timer kept "checking" forever with literally
  // no HTTP request going out - looked alive (spinner flips on and off)
  // while silently doing nothing, which is exactly the bug this guards
  const canCheckTransfer = createMemo(
    () => !claimed() && (verifyUrl() !== null || !sourceConfirmed())
  )

  // one tick checks both sides: whether the destination invoice settled
  // (then claiming the bound note) and - independently - whether
  // the source note actually burned. Rotating it succeeding means it was
  // still there (the transfer failed, restore it); any other failure means
  // it's gone, which just leaves the destination claim (auto or manual) as
  // the remaining step
  const checkTransfer = async () => {
    if (checking()) return
    if (!canCheckTransfer()) {
      stopPolling()
      return
    }
    setChecking(true)
    try {
      if (!claimed()) {
        const url = verifyUrl()
        if (url) {
          try {
            const result = await fetchInvoiceVerification(url)
            // a settled report only proves THIS transfer's funding if it's
            // for the invoice this wallet actually requested
            const requested = invoice()
            if (
              result.settled &&
              requested &&
              !sameInvoice(result.pr, requested)
            ) {
              stopPolling()
              notify(
                'Die neue Ausgabestelle meldet eine andere Rechnung als angefordert — unklar, wo das Geld steht. Prüf beide Scheine, bevor du es nochmal versuchst.',
                NotifyKind.ERROR
              )
              return
            }
            if (result.settled && payingAddress()) {
              await finishAddressPayment()
              return
            }
            if (result.settled) {
              // The note's real k1 is the wallet-held secret, not whatever
              // settlement preimage the destination discloses here.
              const secret = mintSecret()
              if (secret) {
                await claimDestination(secret)
              }
            }
          } catch {
            // a single failed check isn't fatal - the next tick tries again
          }
        }
      }
      // no equivalent probe exists for a device-backed source: the
      // browser-only rotate above is free (k1 already in hand) and tests
      // the MINT's own state directly - a failed rotate means the mint no
      // longer considers the note spendable, i.e. the melt went through.
      // Doing the same against a device-backed note would demand a
      // physical button press every 5-second tick just to check, which
      // isn't worth the cost - list_notes only reflects this wallet's own
      // prior commands, not the mint's truth, so it can't substitute. The
      // destination's own settlement check (above) is what actually
      // confirms success for a device-backed transfer; if the melt failed,
      // "Unspend anyway" on the source note's card remains the manual way
      // back, same as any other melt failure.
      if (!claimed() && !sourceConfirmed() && !props.sourceBearer.deviceId) {
        try {
          const rotated = await rotateNote(
            props.sourceBearer.callback,
            sourceK1()
          )
          stopPolling()
          await updateBearer(props.sourceBearer.id, {
            url: withNewK1(
              props.sourceBearer.url,
              rotated.k1,
              props.sourceBearer.amount,
              rotated.signature
            ),
            spent: false
          })
          notify(
            'Umziehen hat nicht geklappt — der Schein ist weiter deiner (frisch erneuert). Du kannst es nochmal versuchen.',
            NotifyKind.ERROR
          )
          props.onClose()
          return
        } catch (err) {
          if (err instanceof AmbiguousMutationError) {
            // the rotate may have landed despite the failure - the carried
            // secret is then the only copy of the still-unmelted source.
            // Track it unverified and stop probing the source: retrying
            // would gamble (and have to store) another fresh secret every
            // tick, and between this copy and the unchanged source record
            // the sats are accounted for either way - a refresh reconciles
            // which one is real once the service is reachable again
            await addBearer({
              url: withNewK1(
                props.sourceBearer.url,
                err.newSecrets[0],
                props.sourceBearer.amount
              ),
              callback: props.sourceBearer.callback,
              amount: props.sourceBearer.amount,
              verified: false,
              mintPubkey: props.sourceBearer.mintPubkey
            })
            setSourceConfirmed(true)
            notify(
              'Unklar, ob der Schein erneuert wurde — die Wallet hebt beide Fassungen auf und klärt es, sobald die Ausgabestelle antwortet.',
              NotifyKind.ERROR
            )
          } else if (!(err instanceof PendingNoteError)) {
            setSourceConfirmed(true)
            // the source burning is the melt having paid the invoice
            if (payingAddress()) await finishAddressPayment()
          }
        }
      }
    } finally {
      setChecking(false)
    }
  }

  const startPolling = () => {
    stopPolling()
    setSecondsLeft(TRANSFER_POLL_SECONDS)
    pollTimer = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          checkTransfer()
          return TRANSFER_POLL_SECONDS
        }
        return s - 1
      })
    }, 1000)
  }

  const manualCheck = () => {
    if (checking()) return
    checkTransfer()
    startPolling()
  }

  onCleanup(stopPolling)

  // Röhren-Bild statt des Original-Formulars (Steve, 2026-10-24): oben der Schein, der umzieht; Ziele als
  // Karten mit dem eigenen Bestand dort; vor dem Auslösen Von/Nach/Gebühr/Kommt an. Die Logik oben ist
  // unverändert die des Originals.
  const zahl = (msat: number) => Math.floor(msat / 1000).toLocaleString('de-DE')
  const quelle = () => serverOf(props.sourceBearer.url)
  const bestandBei = (server: string) =>
    bearers()
      .filter(b => !b.spent && serverOf(b.url) === serverOf(server))
      .reduce((n, b) => n + b.amount, 0)
  const ziele = createMemo(() =>
    trustedMints().filter(
      m => serverOf(m.server) !== serverOf(props.sourceBearer.url)
    )
  )
  const gebuehr = () => props.sourceBearer.amount - expectedNet()
  const [vonHand, setVonHand] = createSignal(false)
  const neueZiele = () => bekannteStellen().filter(b => b.host !== quelle())
  // describeMintFee des Originals ist englisch
  const gebuehrArt = (fee: MintFee) =>
    [
      fee.baseFeeMsat > 0 ? `${zahl(fee.baseFeeMsat)} Sats fix` : null,
      fee.feePpm > 0
        ? `${(fee.feePpm / 10000).toLocaleString('de-DE', {maximumFractionDigits: 2})} % vom Betrag`
        : null
    ]
      .filter(Boolean)
      .join(' + ')

  return (
    <Dialog onClose={props.onClose}>
      <div class="rz-blatt rz-schein-blatt rz-umziehen">
        <Show
          when={!invoice()}
          fallback={
            <>
              <h3>Zieht um</h3>
              <p class="rz-status">
                <span class="rz-lampe-klein" />{' '}
                {zahl(props.sourceBearer.amount)} Sats von {quelle()} unterwegs
              </p>
              <p class="rz-hinweis">
                Der Schein ist gesperrt, bis die neue Ausgabestelle die Zahlung
                bestätigt. Die Wallet sieht von selbst nach
                <Show when={canCheckTransfer()}>
                  {' '}
                  — wieder in {secondsLeft()} s
                </Show>
                .
              </p>
              <Show when={canCheckTransfer()}>
                <button
                  type="button"
                  class="rz-leise rz-block rz-mitte"
                  disabled={checking() || offlineMode()}
                  onClick={manualCheck}
                >
                  {checking() ? 'Sieht nach …' : 'Jetzt nachsehen'}
                </button>
              </Show>
              {/* ohne Prüfadresse am Ziel: abholen von Hand, erst wenn die Zahlung durch ist (Original) */}
              <Show when={!verifyUrl()}>
                <Show when={mintSecret()}>
                  {secret => (
                    <>
                      <p class="rz-hinweis">
                        Diese Ausgabestelle meldet nicht von selbst, wann die
                        Zahlung angekommen ist. Hol den Schein ab, sobald sie
                        durch ist — der neue Schein gehört nur dieser Wallet.
                      </p>
                      <button
                        type="button"
                        class="rz-knopf an rz-weiter"
                        disabled={checking() || offlineMode()}
                        onClick={() => claimDestination(secret())}
                      >
                        <span class="lbl">Am Ziel abholen</span>
                      </button>
                    </>
                  )}
                </Show>
              </Show>
            </>
          }
        >
          <Schein schein={props.sourceBearer} />
          <Switch>
            <Match when={pendingTrust()}>
              {pending => (
                <>
                  <h3>Neue Ausgabestelle</h3>
                  <p class="rz-hinweis">
                    Die Wallet sieht {serverOf(pending().server)} zum ersten
                    Mal. Wenn du ihr vertraust, merkt sie sich ihren Schlüssel
                    und prüft ihre Scheine damit — auch ohne Netz.
                  </p>
                  <p class="rz-klein rz-schluessel-text">
                    {pending().mintPubkey}
                  </p>
                  <button
                    type="button"
                    class="rz-knopf an rz-weiter"
                    onClick={confirmTrust}
                  >
                    <span class="lbl">Vertrauen</span>
                  </button>
                  <button
                    type="button"
                    class="rz-leise rz-block rz-mitte"
                    onClick={cancelTrust}
                  >
                    Abbrechen
                  </button>
                </>
              )}
            </Match>
            <Match when={readyPayRequest()}>
              {info => (
                <>
                  <h3>
                    {payingAddress() ? 'An eine Adresse senden' : 'Umziehen'}
                  </h3>
                  <div class="rz-gruppe">
                    <div class="rz-setting rz-still">
                      <span class="sl">Von</span>
                      <span class="val">{quelle()}</span>
                    </div>
                    <div class="rz-setting rz-still">
                      <span class="sl">Nach</span>
                      <span class="val">
                        {payingAddress()
                          ? mintInput().trim()
                          : serverOf(info().callback)}
                      </span>
                    </div>
                    <div class="rz-setting rz-still">
                      <span class="sl">Gebühr</span>
                      <span class="val">
                        {info().mintFee
                          ? `${zahl(gebuehr())} Sats (${gebuehrArt(info().mintFee!)})`
                          : 'keine'}
                      </span>
                    </div>
                    <div class="rz-setting rz-still">
                      <span class="sl">Kommt an</span>
                      <span class="val">
                        {info().mintFee ? '≈ ' : ''}
                        {zahl(expectedNet())} Sats
                      </span>
                    </div>
                  </div>
                  <p class="rz-hinweis">
                    <Show
                      when={payingAddress()}
                      fallback={
                        <>
                          Der Schein wird bei {quelle()} eingelöst und kommt als
                          neuer Schein bei {serverOf(info().callback)} an.
                        </>
                      }
                    >
                      Der Betrag gehört danach der Adresse, nicht mehr dieser
                      Wallet.
                    </Show>{' '}
                    Das lässt sich nicht rückgängig machen.
                  </p>
                  <button
                    type="button"
                    class="rz-knopf an rz-weiter"
                    disabled={busy() || offlineMode()}
                    onClick={startTransfer}
                  >
                    <span class="lbl">
                      {busy()
                        ? 'Einen Moment …'
                        : payingAddress()
                          ? `${zahl(props.sourceBearer.amount)} Sats senden`
                          : 'Umziehen'}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="rz-leise rz-block rz-mitte"
                    disabled={busy()}
                    onClick={() => setPayRequest(null)}
                  >
                    Anderes Ziel
                  </button>
                </>
              )}
            </Match>
            <Match when={true}>
              <h3>Wohin soll der Schein?</h3>
              <For each={ziele()}>
                {mint => (
                  <Werkzeug
                    pfad={PFADE.umziehen}
                    titel={serverOf(mint.server)}
                    unter={
                      bestandBei(mint.server)
                        ? `Dort hast du ${zahl(bestandBei(mint.server))} Sats`
                        : 'Dort hast du noch nichts'
                    }
                    aus={busy() || offlineMode()}
                    onClick={() => selectMint(`mint@${serverOf(mint.server)}`)}
                  />
                )}
              </For>
              {/* bekannte, noch nicht vertraute Stellen — dieselbe Liste wie beim Hinzufügen; Antippen führt
              über die Vertrauensfrage, nie still (Gerhard am Pixel, Steve 2026-10-24) */}
              <Show when={neueZiele().length}>
                {/* einmal als Linie statt „Neu“ auf jeder Karte; die Karten darunter leiser (Steve) */}
                <Show when={ziele().length}>
                  <div class="rz-oder-linie">
                    <span>noch nicht verwendet</span>
                  </div>
                </Show>
                <div class="rz-neue-ziele">
                  <For each={neueZiele()}>
                    {b => (
                      <Werkzeug
                        pfad={PFADE.umziehen}
                        titel={b.host}
                        unter={VORSCHLAG[b.host] ?? 'Öffentliche Ausgabestelle'}
                        aus={busy() || offlineMode()}
                        onClick={() => selectMint(b.adresse)}
                      />
                    )}
                  </For>
                </div>
              </Show>
              <Show when={offlineMode()}>
                <p class="rz-hinweis">Ohne Netz geht Umziehen nicht.</p>
              </Show>
              <Show
                when={vonHand() || !(ziele().length + neueZiele().length)}
                fallback={
                  <button
                    type="button"
                    class="rz-leise rz-block rz-mitte"
                    onClick={() => setVonHand(true)}
                  >
                    Andere Ausgabestelle oder Adresse eingeben ›
                  </button>
                }
              >
                <label class="rz-feldname" for="uz-feld">
                  Ausgabestelle oder Lightning-Adresse
                </label>
                <input
                  id="uz-feld"
                  class="rz-feld"
                  type="text"
                  placeholder="mint@stelle.at oder lnurl1…"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck={false}
                  value={mintInput()}
                  onInput={e => setMintInput(e.currentTarget.value)}
                  onKeyDown={e => e.key === 'Enter' && lookup()}
                />
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  disabled={busy() || offlineMode() || !mintInput().trim()}
                  onClick={lookup}
                >
                  <span class="lbl">{busy() ? 'Sieht nach …' : 'Weiter'}</span>
                </button>
              </Show>
              <p class="rz-hinweis">
                Umziehen kostet eine kleine Gebühr: Der Schein wird eingelöst
                und am Ziel neu ausgegeben.
              </p>
            </Match>
          </Switch>
        </Show>
      </div>
    </Dialog>
  )
}
export default TransferDialog
