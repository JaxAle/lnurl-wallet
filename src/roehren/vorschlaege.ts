// Bekannte Ausgabestellen, die noch nicht vertraut sind — eine Liste für „Ausgabestelle hinzufügen“ und
// Umziehen (Gerhard am Pixel, 2026-10-24: beim Umziehen musste er von Hand tippen, was die Wallet kennt).
// Vorgeschlagen, nie still eingetragen (Gerhard, 2026-10-12): am Meetup verwenden alle die Stelle des Vereins.
import {resolveMintInput, serverOf, serviceOriginOf} from '../lnurlcash'
import {isMintTrusted, PUBLIC_MINTS} from '../trustedMints'

// vorerst nicht vorschlagen (von Hand eintragen geht weiter): lnurl.21mint.me meldete einen Schein bei der
// Nachfrage als gültig, Zeus kurz danach als unbekannt — 100 Sats ungeklärt (BEFUNDE, 2026-10-15)
const NICHT_VORSCHLAGEN = new Set(['lnurl.21mint.me'])

export const VORSCHLAG: Record<string, string> = {
  'lnurl.21linz.at': 'Bitcoin Club Linz — am Meetup verwendet'
}

export const bekannteStellen = () =>
  PUBLIC_MINTS.map(a => ({adresse: a, url: resolveMintInput(a)}))
    .filter(x => x.url && !isMintTrusted(serviceOriginOf(x.url)))
    .map(x => ({adresse: x.adresse, host: serverOf(x.url!)}))
    .filter(x => !NICHT_VORSCHLAGEN.has(x.host))
    .sort((a, b) => Number(!!VORSCHLAG[b.host]) - Number(!!VORSCHLAG[a.host]))
