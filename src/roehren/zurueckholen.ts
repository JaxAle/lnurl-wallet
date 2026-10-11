// Schein zurückholen (Prototyp: „Doch nicht senden, Schein zurückholen“): der übergebene QR wird
// wertlos, der Betrag bleibt in der Wallet. Technisch das Erneuern (Rotate) des Originals —
// nachgebaut nach Wallet.tsx refreshOneBearer, ohne den Vault-Zweig (Senden spaltet nur Scheine,
// deren Geheimnis im Browser liegt).
//
// Hat der Empfänger schon eingelöst, ist das kein Fehler: der Schein wird als ausgegeben markiert.
import {
  AmbiguousMutationError,
  fetchNoteInfo,
  NoteSpentError,
  NoteUnknownError,
  probeBurnedNote,
  requireNoteK1,
  rotateNote,
  serverOf,
  withNewK1
} from '../lnurlcash'
import type {Bearer} from '../storage'
import type {WalletContextType} from '../WalletContext'
import {vergiss} from './einloesen'

type Kontext = Pick<WalletContextType, 'addBearer' | 'updateBearer' | 'logActivity'>

export type Ergebnis = 'zurueck' | 'schon-eingeloest'

export const holeZurueck = async (schein: Bearer, ctx: Kontext): Promise<Ergebnis> => {
  const {addBearer, updateBearer, logActivity} = ctx
  const sats = Math.floor(schein.amount / 1000)

  let info
  try {
    info = await fetchNoteInfo(schein.url)
  } catch (err) {
    if (err instanceof NoteSpentError || err instanceof NoteUnknownError) {
      await updateBearer(schein.id, {spent: true})
      vergiss(schein.id)
      return 'schon-eingeloest'
    }
    throw err
  }

  let url: string
  try {
    const rotiert = await rotateNote(info.callback, requireNoteK1(schein.url))
    url = withNewK1(schein.url, rotiert.k1, info.maxWithdrawable, rotiert.signature)
  } catch (err) {
    if (err instanceof NoteSpentError) {
      // zwischen Nachfrage und Erneuern eingelöst
      await updateBearer(schein.id, {spent: true})
      vergiss(schein.id)
      return 'schon-eingeloest'
    }
    if (!(err instanceof AmbiguousMutationError)) throw err
    // wie im Original: Ist das Erneuern vielleicht doch angekommen, ist das frische Geheimnis
    // die einzige Kopie — nie raten, im Zweifel beide behalten
    const ausgang = await probeBurnedNote(schein.url)
    if (ausgang === 'gone') {
      url = withNewK1(schein.url, err.newSecrets[0], info.maxWithdrawable)
    } else {
      if (ausgang === 'unknown') {
        await addBearer({
          url: withNewK1(schein.url, err.newSecrets[0], info.maxWithdrawable),
          callback: info.callback,
          amount: info.maxWithdrawable,
          verified: false,
          mintPubkey: info.mintPubkey ?? schein.mintPubkey
        })
      }
      throw err
    }
  }

  await updateBearer(schein.id, {
    url,
    callback: info.callback,
    amount: info.maxWithdrawable,
    verified: true,
    mintPubkey: info.mintPubkey ?? schein.mintPubkey
  })
  vergiss(schein.id)
  logActivity('refresh', `Schein über ${sats} Sats zurückgeholt (${serverOf(url)}) — der gezeigte QR ist wertlos.`, schein.label)
  return 'zurueck'
}
