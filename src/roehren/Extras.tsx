// Extras (Steve, 2026-10-17): unter „Extras“ lag ein Werkzeugkasten für Entwickler, darin vier echte
// Geschenke für Menschen — jemandem Sats schenken, beim Meetup eine Tombola, am Stand kassieren, Geld
// für später wegschließen. Diese vier stehen hier, je mit einem Satz, was sie für einen tun. Antippen
// schaltet die Erweiterung ein (das Original verlangt das ausdrücklich) und öffnet sie. Alles andere
// bleibt unter „Für Entwickler“ — nichts ist gelöscht.
import type {Component} from 'solid-js'
import {For} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {enabledAddonIds, setAddonEnabled} from '../addons/enabled'
import './roehren.css'

export const EXTRAS: {
  id: string
  name: string
  satz: string
  seite?: string
}[] = [
  {
    id: 'giftcard',
    name: 'Geschenkkarte',
    satz: 'Sats verschenken — als Karte mit QR zum Ausdrucken.',
    seite: '/extras/geschenkkarte' // eigener Bildschirm (Geschenkkarte.tsx)
  },
  {
    id: 'raffle',
    name: 'Tombola',
    satz: 'Preise fürs Meetup — Lose mit Sats zum Ausdrucken.',
    seite: '/extras/tombola' // eigener Bildschirm (Tombola.tsx) statt des Formulars der Erweiterung
  },
  {
    id: 'pos',
    name: 'Kassa',
    satz: 'Am Stand kassieren — Betrag tippen, der Gast zahlt mit Lightning.',
    seite: '/extras/kassa' // eigener Bildschirm (Kassa.tsx), Tastatur wie bei Senden
  }
  // Zeitschloss steht unter Für Entwickler (Steve, 2026-10-25): die Wallet kann den geschlossenen Schein
  // nicht selbst aufbewahren — der Link ist der einzige Beleg, verloren heißt das Geld verloren
]

// deutsche Namen für die Kopfzeile der Erweiterung (AddonRun)
export const extraName = (id: string) => EXTRAS.find(e => e.id === id)?.name

const Extras: Component = () => {
  const navigate = useNavigate()
  const oeffne = (e: (typeof EXTRAS)[number]) => {
    if (e.seite) return navigate(e.seite)
    if (!enabledAddonIds().has(e.id)) setAddonEnabled(e.id, true)
    navigate(`/addons/${e.id}`)
  }
  return (
    <div class="page rz-einstellungen">
      <div class="rz-seitenkopf">
        <A
          href="/settings"
          class="rz-zurueck"
          aria-label="Zurück zu den Einstellungen"
        >
          ‹
        </A>
        <h2>Extras</h2>
      </div>
      <div class="rz-gruppe">
        <For each={EXTRAS}>
          {e => (
            <button type="button" class="rz-setting" onClick={() => oeffne(e)}>
              <span>
                <span class="sl">{e.name}</span>
                <span class="s">{e.satz}</span>
              </span>
              <span class="val">›</span>
            </button>
          )}
        </For>
      </div>
      <A href="/extras/entwickler" class="rz-aendern rz-block rz-mitte">
        Für Entwickler ›
      </A>
    </div>
  )
}

export default Extras
