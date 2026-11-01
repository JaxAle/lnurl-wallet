// Interne Überweisung (LUD-25) auf der Bezahlen-Seite (Gerhard, 2026-11-01): nennt die Adresse des Empfängers
// eine Ableitung (internalTransfer) und liegen hier Scheine bei derselben Ausgabestelle, werden sie direkt auf
// den nächsten Schlüssel des Empfängers umgeschrieben — keine Rechnung, kein Lightning, keine Gebühr.
// Ablauf und Abgleich bei unklarer Antwort wie im alten Dialog (components/MeltDialog.tsx,
// payWithInternalTransfer), nur ohne dessen Bildschirmzustand.
import type {InternalTransferHint} from '../lib/internalTransfer'
import type {InternalTransferResult} from '../lnurlcash'
import {
  AmbiguousMutationError,
  payInternalTransfer,
  probeBurnedNote,
  requireNoteK1,
  serverOf,
  settleNote,
  withNewK1
} from '../lnurlcash'
import type {Bearer} from '../storage'
import type {useWallet} from '../WalletContext'

// Auswahl: ein Schein über genau den Betrag (freies Umschreiben), sonst alle, wenn sie genau reichen,
// sonst der Reihe nach, bis es reicht (Wechselgeld) — wie pickInternalTransferBearers
export const waehleIntern = (verfuegbar: Bearer[], msat: number): Bearer[] => {
  const genau = verfuegbar.find(b => b.amount === msat)
  if (genau) return [genau]
  const summe = verfuegbar.reduce((s, b) => s + b.amount, 0)
  if (summe === msat) return verfuegbar
  const gewaehlt: Bearer[] = []
  let laufend = 0
  for (const b of verfuegbar) {
    if (laufend >= msat) break
    gewaehlt.push(b)
    laufend += b.amount
  }
  return laufend >= msat ? gewaehlt : []
}

// nur Scheine bei der Stelle des Empfängers, deren Geheimnis in diesem Browser liegt (der Tresor kann
// keinen fremden Schlüssel als Ziel nennen)
export const scheineBei = (verfuegbar: Bearer[], callback: string): Bearer[] =>
  verfuegbar.filter(
    b =>
      !b.deviceId && b.callback !== '' && serverOf(b.url) === serverOf(callback)
  )

type Ctx = Pick<
  ReturnType<typeof useWallet>,
  'addBearer' | 'updateBearer' | 'removeBearer'
> & {notify: (satz: string) => void}

// wirft bei Fehlschlag; kehrt zurück, wenn die Scheine umgeschrieben sind
export const uebertrageIntern = async (
  gewaehlt: Bearer[],
  msat: number,
  hint: InternalTransferHint,
  ctx: Ctx
): Promise<void> => {
  const summe = gewaehlt.reduce((s, b) => s + b.amount, 0)
  if (!gewaehlt.length || summe < msat)
    throw new Error('Nicht genug Scheine bei dieser Ausgabestelle.')
  const basis = gewaehlt[0]!
  const k1s = gewaehlt.map(b => requireNoteK1(b.url))
  let wechselK1: string | undefined
  let wechselSig: string | undefined
  try {
    const r: InternalTransferResult = await payInternalTransfer(
      basis.callback,
      k1s,
      msat,
      summe,
      hint
    )
    if (r.kind === 'split') {
      wechselK1 = r.change
      wechselSig = r.changeSignature
    }
  } catch (err) {
    if (!(err instanceof AmbiguousMutationError)) throw err
    // vielleicht doch angekommen: einen eingesetzten Schein nachfragen, bevor das Wechselgeld zählt
    const lage = await probeBurnedNote(basis.url)
    if (lage === 'live') throw err
    if (lage === 'unknown') {
      if (err.newSecrets.length > 0)
        await ctx.addBearer({
          url: withNewK1(basis.url, err.newSecrets[0]!, summe - msat),
          callback: basis.callback,
          amount: summe - msat,
          verified: false,
          mintPubkey: basis.mintPubkey
        })
      throw new Error(
        'Die interne Übertragung ist vielleicht angekommen, aber nicht bestätigt – ' +
          (err.newSecrets.length > 0
            ? 'das mögliche Wechselgeld liegt ungeprüft neben den alten Scheinen. Vor einem neuen Versuch erneuern.'
            : 'die eingesetzten Scheine stehen noch als nicht ausgegeben da. Vor einem neuen Versuch erneuern.')
      )
    }
    if (err.newSecrets.length > 0) wechselK1 = err.newSecrets[0]
  }
  // ab hier sind die eingesetzten Scheine bei der Stelle verbraucht: Wechselgeld zuerst sichern, dann löschen
  if (!wechselK1) {
    for (const b of gewaehlt) ctx.removeBearer(b.id)
    return
  }
  const wechsel = await ctx.addBearer({
    url: withNewK1(basis.url, wechselK1, summe - msat, wechselSig),
    callback: basis.callback,
    amount: summe - msat,
    verified: false,
    mintPubkey: basis.mintPubkey
  })
  for (const b of gewaehlt) ctx.removeBearer(b.id)
  try {
    const s = await settleNote(basis.url, wechselK1, summe - msat, wechselSig)
    await ctx.updateBearer(wechsel.id, {
      url: withNewK1(basis.url, s.k1, s.amountMsat, s.signature),
      callback: s.callback,
      amount: s.amountMsat,
      verified: true
    })
  } catch (err) {
    ctx.notify(
      `Übertragen, aber der Wechselgeld-Schein ist nicht fertig bestätigt (${(err as Error).message}) – er steht ungeprüft da; erneuern repariert ihn.`
    )
  }
}
