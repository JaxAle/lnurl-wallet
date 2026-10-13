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
