// Entsperren auf dem Röhrenfeld, nach dem Prototyp (screens.lock, Gerhard, 2026-10-16): Code tippen, richtig →
// LN · URL · CASH glüht auf, unten „by DNI“, dann öffnet die Wallet. Die Wallet kennt nur die Länge des
// Codes (öffnet nach dem letzten Zeichen von selbst); der Schlüssel unten holt ihn aus dem Passwortmanager.
import type {Component} from 'solid-js'
import {createSignal} from 'solid-js'
import {A} from '@solidjs/router'

import {useWallet} from '../WalletContext'
import {pruefePasswort} from './passwort'
import Roehrenfeld from './Roehrenfeld'
import {
  codeLaenge,
  fehlversuch,
  geschafft,
  kandidaten,
  merkeLaenge,
  vergissLaenge,
  tippbar,
  wartenBis
} from './roehrencode'

const ZEIGEN_MS = 2400

const Roehrenschloss: Component = () => {
  const {unlock} = useWallet()
  const [laenge, setLaenge] = createSignal(codeLaenge())
  const [sperreBis, setSperreBis] = createSignal(wartenBis())
  let autoFehl = 0

  const pruefe = async (code: string, ausManager: boolean) => {
    let richtig: string | null = null
    for (const k of kandidaten(code)) {
      if (await pruefePasswort(k)) {
        richtig = k
        break
      }
    }
    if (!richtig) {
      setSperreBis(fehlversuch())
      // zweimal hintereinander falsch bei gemerkter Länge: vielleicht stimmt die Länge nicht mehr
      // (Sicherung eingespielt, anderswo geändert) — dann wieder mit Knopf, ohne Länge
      if (!ausManager && laenge() !== null && ++autoFehl >= 2) {
        vergissLaenge()
        setLaenge(null)
      }
      return 'falsch' as const
    }
    geschafft()
    // nur ein auf den Röhren tippbarer Code bekommt eine Länge — der aus dem Manager wird nie getippt
    if (!ausManager && tippbar(code)) merkeLaenge(code.length)
    const pw = richtig
    setTimeout(() => void unlock(pw).catch(() => location.reload()), ZEIGEN_MS)
    return 'offen' as const
  }

  return (
    <Roehrenfeld
      onCode={pruefe}
      aktion="Öffnen"
      autocomplete="current-password"
      laenge={laenge()}
      sperreBis={sperreBis()}
      unten={
        <A href="/passwort-vergessen" class="rz-schloss-vergessen">
          Code vergessen?
        </A>
      }
    />
  )
}

export default Roehrenschloss
