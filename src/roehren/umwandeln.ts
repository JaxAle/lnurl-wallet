// Empfangene Scheine umwandeln (Steve, 2026-10-16): beim Absichern eines empfangenen Scheins bekommt er
// ein Geheimnis aus den eigenen zwölf Wörtern (pub/sig, ck1) — dann findet „Scheine wiederfinden“ ihn,
// und die Sicherungsdatei wird zur Notlösung. Eine Anfrage wie das gewöhnliche Erneuern (dieselbe
// Schnittstelle, derselbe Betrag), nur mit anderem neuem Geheimnis.
//
// Ein Schein, der schon ck1 ist (aus dieser Wallet oder einer anderen mit pub/sig), wird beim Erneuern
// ohnehin mit einem Geheimnis aus unseren Wörtern ersetzt (lib/request.ts isUpgradedSecret). Umgewandelt
// wird also nur ein alter Hash-Schein — und nur bei einer Stelle, die uns schon pub/sig-Scheine
// ausgegeben hat (Zähler in cashSecrets.ts > 0). Bei jeder anderen bleibt es beim gewöhnlichen Erneuern.
import {readCashAddressSecretIndices} from '../cashSecrets'
import {rotateNote, serverOf, upgradeNote} from '../lnurlcash'
import {isUpgradedSecret} from '../lib/request'

export const kenntPubSig = (host: string): boolean =>
  (readCashAddressSecretIndices()[host] ?? 0) > 0

export const erneuereEmpfangen = (callback: string, k1: string) =>
  !isUpgradedSecret(k1) && kenntPubSig(serverOf(callback))
    ? upgradeNote(callback, k1)
    : rotateNote(callback, k1)
