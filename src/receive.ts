import {
  resolveNoteInput,
  noteK1,
  noteDeclaredAmount,
  serverOf,
  fetchNoteInfo,
  withNewK1,
  requireNoteK1,
  noteEndpointOf,
  probeBurnedNote,
  NoteSpentError,
  NoteUnknownError,
  PendingNoteError,
  AmbiguousMutationError
} from './lnurlcash'
import {deviceReceive} from './deviceOrchestration'
import {erneuereEmpfangen} from './roehren/umwandeln'
import type {DeviceClient} from './device'
import {notify, NotifyKind, msatToSats} from './helpers'
import type {Bearer, ActivityKind} from './storage'
import type {NewBearer} from './WalletContext'

// shared by Scan and Paste: resolve whatever came in to a note URL, ask the
// issuing service what it is worth (an informational GET by sha256(k1), with a
// raw-k1 fallback only for older services). Returns the note even when the info fetch
// fails - a bearer is better stored unverified than dropped.
export const receiveNote = async (
  input: string,
  existing: Bearer[]
): Promise<NewBearer> => {
  const url = resolveNoteInput(input)
  if (!url) {
    throw new Error('Das ist kein LNURLcash-Schein (es fehlt das k1).')
  }
  const k1 = noteK1(url)
  if (
    existing.some(
      b => noteK1(b.url) === k1 && serverOf(b.url) === serverOf(url)
    )
  ) {
    throw new Error('Dieser Schein ist schon in deiner Wallet.')
  }
  try {
    const info = await fetchNoteInfo(url)
    return {
      url,
      callback: info.callback,
      amount: info.maxWithdrawable,
      verified: true,
      mintPubkey: info.mintPubkey
    }
  } catch (err) {
    // the service positively told us this k1 is dead - that's worth more
    // than the sender's own claim, so don't paper over it with an
    // unverified fallback the way an unreachable/unknown-shaped error
    // below does. The caller (ReceiveDialog.tsx) surfaces this and never stores
    // the note.
    if (err instanceof NoteSpentError || err instanceof NoteUnknownError) {
      throw err
    }
    // service unreachable (or some other non-definitive failure) - fall
    // back to the sender's own (unverified) declared amount so the note
    // isn't shown as worth nothing
    return {
      url,
      callback: '',
      amount: noteDeclaredAmount(url) ?? 0,
      verified: false
    }
  }
}

// After receiving a note, rotate it: the previous holder and anything that
// logged the handed-over URL still know the old secret - a rotate burns it and mints
// a fresh one only this wallet knows. Returns the updated note URL. Throws
// when the service refuses (e.g. a plain LUD-03 withdraw link that doesn't
// speak lnurlcash) - the caller should warn, not fail the receive.
export const secureReceivedNote = async (note: {
  url: string
  callback: string
  amount: number
}): Promise<string> => {
  const k1 = noteK1(note.url)
  if (!k1 || !note.callback) {
    throw new Error('Der Schein hat noch keine Adresse zum Erneuern.')
  }
  // Fork: alte Hash-Scheine dabei in eigene, aus den Wörtern wiederfindbare umwandeln (roehren/umwandeln.ts)
  const result = await erneuereEmpfangen(note.callback, k1)
  return withNewK1(note.url, result.k1, note.amount, result.signature)
}

export type ReceiveContext = {
  bearers: Bearer[]
  addBearer: (note: NewBearer) => Promise<Bearer>
  updateBearer: (
    id: string,
    changes: Partial<Omit<Bearer, 'id'>>
  ) => Promise<void>
  logActivity: (kind: ActivityKind, message: string, label?: string) => void
  deviceClient: DeviceClient | null
}

// The full "bring a note in" flow: receiveNote + secureReceivedNote (or the
// device-bound equivalent) above, plus the storage/activity/notification
// side effects around them - shared by every entry point that accepts a
// note (Wallet.tsx's own scan/paste/type on the hero widget, ReceiveDialog's
// review-first flow for a vault handoff link). Re-entrancy is the caller's
// job (see e.g. ReceiveDialog's own busy() guard) - this itself just does
// the work once, top to bottom, and throws only for receiveNote's own
// up-front failures (not a note at all, already held, or definitively
// spent/unknown); everything after a note is actually stored is reported
// via notify()/logActivity() instead; a failed rotate still means "the
// note is yours", just not yet a secret only you know.
export const receiveIntoWallet = async (
  noteValue: string,
  ctx: ReceiveContext
): Promise<void> => {
  const received = await receiveNote(noteValue, ctx.bearers)
  const bearer = await ctx.addBearer(received)
  if (!received.verified) {
    notify(
      'Schein gespeichert, aber die Ausgabestelle war nicht erreichbar – später erneuern.',
      NotifyKind.LOADING
    )
    return
  }
  // rotate immediately: whoever handed this note over still knows the old
  // secret until it is burned. If a vault is connected, that fresh secret
  // is generated and held there instead of in this browser.
  try {
    if (ctx.deviceClient) {
      const result = await deviceReceive(
        ctx.deviceClient,
        received.url,
        received.callback,
        noteEndpointOf(received.url),
        requireNoteK1(received.url),
        received.amount
      )
      await ctx.updateBearer(bearer.id, {
        url: result.url,
        callback: result.callback,
        deviceId: result.deviceId,
        deviceHash: result.deviceHash
      })
    } else {
      const url = await secureReceivedNote(received)
      await ctx.updateBearer(bearer.id, {url})
    }
    ctx.logActivity(
      'receive',
      `${msatToSats(received.amount)} Sats empfangen von ${serverOf(received.url)}.`
    )
    // Fork: keine Erfolgsmeldung — das Zählwerk zählt hinauf (Steve, 2026-10-11, bestätigt 2026-10-25)
  } catch (err) {
    if (err instanceof AmbiguousMutationError) {
      // the rotate request may have landed despite the failure - the fresh
      // secret it carried is then the only copy of this note
      const outcome = await probeBurnedNote(received.url)
      if (outcome === 'gone') {
        // the burn landed - adopt the fresh secret as the note
        const url = withNewK1(received.url, err.newSecrets[0], received.amount)
        await ctx.updateBearer(bearer.id, {url})
        ctx.logActivity(
          'receive',
          `${msatToSats(received.amount)} Sats empfangen von ${serverOf(received.url)} (erneuert – nach unklarer Antwort bestätigt).`
        )
        // Fork: keine Erfolgsmeldung — das Zählwerk zählt hinauf (Steve, 2026-10-11)
        return
      }
      if (outcome === 'unknown') {
        // can't tell: keep the stored original AND track the possible
        // rotated copy, rather than gamble either way
        await ctx.addBearer({
          url: withNewK1(received.url, err.newSecrets[0], received.amount),
          callback: received.callback,
          amount: received.amount,
          verified: false,
          mintPubkey: received.mintPubkey
        })
        ctx.logActivity(
          'receive',
          `${msatToSats(received.amount)} Sats empfangen von ${serverOf(received.url)} (Erneuern unklar – mögliche Kopie ungeprüft gespeichert).`
        )
        notify(
          `${msatToSats(received.amount)} Sats empfangen, aber ob das Erneuern ankam, ist unklar – die mögliche neue Kopie liegt ungeprüft daneben; beide erneuern, um es zu klären.`,
          NotifyKind.ERROR
        )
        return
      }
      // 'live': the rotate never landed - the messages below fit as-is
    }
    // a PendingNoteError here means this exact k1 has some other operation
    // in flight on the service right now (e.g. the sender's own melt/rotate
    // hasn't settled yet) - temporary, and the note is already stored
    // (addBearer above), so it'll simply rotate on the next refresh.
    // Reporting it the same as every other failure ("the service refused to
    // rotate") reads as a permanent limitation instead of "try again
    // shortly" (see issue #3).
    const pending = err instanceof PendingNoteError
    ctx.logActivity(
      'receive',
      `${msatToSats(received.amount)} Sats empfangen von ${serverOf(received.url)} (${pending ? 'Erneuern ausstehend – beim nächsten Mal' : 'nicht erneuert – Absender hat vielleicht noch eine Kopie'}).`
    )
    notify(
      pending
        ? `${msatToSats(received.amount)} Sats empfangen, aber noch nicht erneuert – bei der Ausgabestelle läuft gerade ein anderer Vorgang. Beim nächsten Erneuern geschieht es von selbst.`
        : `${msatToSats(received.amount)} Sats empfangen, aber die Ausgabestelle verweigerte das Erneuern – der Absender hat vielleicht noch eine gültige Kopie.`,
      NotifyKind.ERROR
    )
  }
}
