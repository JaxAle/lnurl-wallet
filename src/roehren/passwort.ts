// Passwort ändern oder setzen (Gerhard, 2026-10-13) — das Original setzt es nur beim Einrichten.
// Das Passwort verschlüsselt nicht die Scheine, sondern die Schlüssel im Browser (keys.ts): den
// Speicherschlüssel (bzw. den alten Verknüpfungsschlüssel) und den Schlüssel für wiederherstellbare
// Scheine. Ändern heißt: alle vorhandenen mit dem alten öffnen, mit dem neuen verschließen.
// Scheine und Verlauf bleiben unberührt.
//
// Sicher gegen Abbruch: erst alles öffnen (prüft das alte Passwort), dann alles neu verschlüsseln, erst
// dann schreiben — die alten Einträge bleiben bis zur Probe mit dem neuen Passwort aufgehoben und werden
// bei jedem Fehler zurückgeschrieben. So gibt es keinen Stand mit gemischten Passwörtern.
import {bytesToHex} from '@noble/hashes/utils.js'

import {
  cashRootToHex,
  decryptRecord,
  deriveBearerAesKey,
  deriveLud25CashRootNode,
  deriveStorageRootKey,
  deriveWalletLinkingKey,
  encryptRecord,
  decryptSavedCashRootKeyHex,
  decryptSavedLinkingKey,
  decryptSavedStorageRootKey,
  getPlainCashRootKeyHex,
  getPlainLinkingKey,
  getPlainStorageRootKey,
  encryptSecretParts,
  savedCashRootKeyExists,
  savedCashRootKeyIsEncrypted,
  savedKeyExists,
  savedKeyIsEncrypted,
  savedStorageRootKeyExists,
  savedStorageRootKeyIsEncrypted
} from '../keys'
import {noteK1} from '../lnurlcash'
import {satzAus, woerterProblem} from './woerter'

const EINTRAEGE = [
  'lnurlwallet_storage_root_key',
  'lnurlwallet_linking_key',
  'lnurlwallet_cash_root_key'
]

type Offen = {
  speicher?: Uint8Array
  verknuepfung?: Uint8Array
  bargeld?: string
}

// alle vorhandenen Schlüssel öffnen — wirft bei falschem Passwort
const oeffne = async (passwort: string | undefined): Promise<Offen> => {
  const o: Offen = {}
  if (savedStorageRootKeyExists()) {
    o.speicher = savedStorageRootKeyIsEncrypted()
      ? await decryptSavedStorageRootKey(passwort ?? '')
      : (getPlainStorageRootKey() ?? undefined)
  }
  if (savedKeyExists()) {
    o.verknuepfung = savedKeyIsEncrypted()
      ? await decryptSavedLinkingKey(passwort ?? '')
      : (getPlainLinkingKey() ?? undefined)
  }
  if (savedCashRootKeyExists()) {
    o.bargeld = savedCashRootKeyIsEncrypted()
      ? await decryptSavedCashRootKeyHex(passwort ?? '')
      : (getPlainCashRootKeyHex() ?? undefined)
  }
  return o
}

const gleich = (a?: Uint8Array, b?: Uint8Array) =>
  (!a && !b) ||
  (!!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]))

export class FalschesPasswort extends Error {
  constructor() {
    super('Das bisherige Passwort stimmt nicht.')
  }
}

// nur prüfen, ob das bisherige Passwort stimmt (erster Schritt der Seite) — verändert nichts
export const pruefePasswort = async (alt: string): Promise<boolean> => {
  try {
    await oeffne(alt)
    return true
  } catch {
    return false
  }
}

// alt: bisheriges Passwort, oder undefined, wenn die Wallet keines hat (Setzen)
export const setzePasswort = async (
  alt: string | undefined,
  neu: string
): Promise<void> => {
  let offen: Offen
  try {
    offen = await oeffne(alt)
  } catch {
    throw new FalschesPasswort()
  }
  if (!offen.speicher && !offen.verknuepfung)
    throw new Error('Auf diesem Gerät ist keine Wallet.')

  const vorher = new Map(EINTRAEGE.map(k => [k, localStorage.getItem(k)]))
  const zurueck = () => {
    for (const [k, v] of vorher) {
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    }
  }
  try {
    // erst alles im Speicher verschlüsseln (dauert), dann ohne Pause schreiben (synchron) — kein
    // Zeitpunkt, an dem ein Schlüssel das neue und ein anderer das alte Passwort hat
    const neuVerschluesselt: [string, string][] = []
    if (offen.speicher)
      neuVerschluesselt.push([
        EINTRAEGE[0],
        JSON.stringify({
          enc: true,
          ...(await encryptSecretParts(bytesToHex(offen.speicher), neu))
        })
      ])
    if (offen.verknuepfung)
      neuVerschluesselt.push([
        EINTRAEGE[1],
        JSON.stringify({
          enc: true,
          ...(await encryptSecretParts(bytesToHex(offen.verknuepfung), neu))
        })
      ])
    if (offen.bargeld)
      neuVerschluesselt.push([
        EINTRAEGE[2],
        JSON.stringify({
          enc: true,
          ...(await encryptSecretParts(offen.bargeld, neu))
        })
      ])
    for (const [k, v] of neuVerschluesselt) localStorage.setItem(k, v)
    // Probe: mit dem neuen Passwort muss genau dasselbe herauskommen
    const probe = await oeffne(neu)
    if (
      !gleich(probe.speicher, offen.speicher) ||
      !gleich(probe.verknuepfung, offen.verknuepfung) ||
      probe.bargeld !== offen.bargeld
    ) {
      throw new Error('Probe mit dem neuen Passwort fehlgeschlagen.')
    }
  } catch (err) {
    zurueck()
    throw new Error(
      `Passwort nicht geändert — alles ist wie vorher. (${(err as Error).message})`
    )
  }
}

// ---- Passwort vergessen (Gerhard am iPad, 2026-10-15) ----
// Mit den zwölf Wörtern ein neues Passwort setzen — auch wenn die Wallet gesperrt ist. Räumt dabei den
// Zustand auf, den „Wiederherstellen mit den zwölf Wörtern“ über einer bestehenden Wallet hinterlässt:
// alter Speicherschlüssel (vergessenes Passwort) + neuer Verknüpfungsschlüssel (ohne Passwort), die
// Scheine verteilt auf beide. Danach gibt es nur noch den Speicherschlüssel, unter dem neuen Passwort;
// alle lesbaren Scheine und der Verlauf sind darunter neu verschlüsselt, doppelte (derselbe Schein, einmal
// alt und einmal wiedergefunden) zu einem zusammengelegt. Nichts davon geht ins Netz.

const BESTAND = 'lnurlcash_bearers'
const VERLAUF = 'lnurlcash_activity'

type Datensatz = {id: string; iv: string; ciphertext: string}

const liesListe = (k: string): Datensatz[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const entschluessle = async <T>(
  key: CryptoKey,
  r: Datensatz
): Promise<T | null> => {
  try {
    const {id: _id, ...teile} = r
    return await decryptRecord<T>(key, teile)
  } catch {
    return null
  }
}

export class FremdeWoerter extends Error {
  constructor() {
    super(
      'Diese zwölf Wörter gehören nicht zu dieser Wallet — kein einziger Schein ließ sich damit lesen.'
    )
  }
}

export const passwortVergessen = async (
  woerter: string,
  neu: string
): Promise<{scheine: number; doppelt: number}> => {
  const seed = satzAus(woerter)
  const problem = woerterProblem(woerter)
  if (problem) throw new Error(problem)
  const speicher = deriveStorageRootKey(seed)
  const verknuepfung = deriveWalletLinkingKey(seed)
  const bargeld = cashRootToHex(deriveLud25CashRootNode(seed))
  const kS = await deriveBearerAesKey(speicher)
  const kL = await deriveBearerAesKey(verknuepfung)

  // 1. lesen und prüfen: gehören die Wörter zu dieser Wallet?
  const bestand = liesListe(BESTAND)
  const unterS: {r: Datensatz; k1: string | null}[] = []
  const unterL: {
    r: Datensatz
    klar: Record<string, unknown>
    k1: string | null
  }[] = []
  const fremd: Datensatz[] = []
  for (const r of bestand) {
    const s = await entschluessle<{url: string}>(kS, r)
    if (s) {
      unterS.push({r, k1: noteK1(s.url)})
      continue
    }
    const l = await entschluessle<Record<string, unknown> & {url: string}>(
      kL,
      r
    )
    if (l) unterL.push({r, klar: l, k1: noteK1(l.url)})
    else fremd.push(r)
  }
  if (bestand.length > 0 && unterS.length + unterL.length === 0)
    throw new FremdeWoerter()

  // 2. neu zusammenstellen: alles unter dem Speicherschlüssel, Doppelte nur einmal
  const vorhanden = new Set(unterS.map(x => x.k1).filter(Boolean))
  let doppelt = 0
  const neuerBestand: Datensatz[] = [...unterS.map(x => x.r)]
  for (const x of unterL) {
    if (x.k1 && vorhanden.has(x.k1)) {
      doppelt++
      continue
    }
    if (x.k1) vorhanden.add(x.k1)
    neuerBestand.push({id: x.r.id, ...(await encryptRecord(kS, x.klar))})
  }
  neuerBestand.push(...fremd) // fremde Datensätze nie anfassen, nie löschen

  const neuerVerlauf: Datensatz[] = []
  for (const r of liesListe(VERLAUF)) {
    if (await entschluessle(kS, r)) neuerVerlauf.push(r)
    else {
      const l = await entschluessle<Record<string, unknown>>(kL, r)
      neuerVerlauf.push(l ? {id: r.id, ...(await encryptRecord(kS, l))} : r)
    }
  }

  const neuSpeicher = JSON.stringify({
    enc: true,
    ...(await encryptSecretParts(bytesToHex(speicher), neu))
  })
  const neuBargeld = JSON.stringify({
    enc: true,
    ...(await encryptSecretParts(bargeld, neu))
  })

  // 3. schreiben — alter Stand aufgehoben, bei jedem Fehler zurück
  const ALLES = [...EINTRAEGE, BESTAND, VERLAUF]
  const vorher = new Map(ALLES.map(k => [k, localStorage.getItem(k)]))
  try {
    localStorage.setItem(BESTAND, JSON.stringify(neuerBestand))
    localStorage.setItem(VERLAUF, JSON.stringify(neuerVerlauf))
    localStorage.setItem(EINTRAEGE[0], neuSpeicher)
    localStorage.setItem(EINTRAEGE[2], neuBargeld)
    localStorage.removeItem(EINTRAEGE[1]) // Verknüpfungsschlüssel: ersetzt durch den Speicherschlüssel
    const probe = await oeffne(neu)
    if (
      !gleich(probe.speicher, speicher) ||
      probe.bargeld !== bargeld ||
      probe.verknuepfung
    ) {
      throw new Error('Probe mit dem neuen Passwort fehlgeschlagen.')
    }
  } catch (err) {
    for (const [k, v] of vorher) {
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    }
    throw new Error(
      `Nichts geändert — alles ist wie vorher. (${(err as Error).message})`
    )
  }
  return {scheine: unterS.length + unterL.length - doppelt, doppelt}
}
