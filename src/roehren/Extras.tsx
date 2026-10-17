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

export const EXTRAS: {id: string; name: string; satz: string}[] = [
  {
    id: 'giftcard',
    name: 'Geschenkkarte',
    satz: 'Sats verschenken — als Karte mit QR zum Ausdrucken.'
  },
  {
    id: 'raffle',
    name: 'Tombola',
    satz: 'Preise fürs Meetup — Lose mit Sats zum Ausdrucken.'
  },
  {
    id: 'pos',
    name: 'Kassa',
    satz: 'Am Stand kassieren — Betrag tippen, der Gast zahlt mit Lightning.'
  },
  {
    id: 'timelocker',
    name: 'Zeitschloss',
    satz: 'Einen Schein bis zu einem Datum wegschließen — auch vor dir selbst.'
  }
]

// deutsche Namen für die Kopfzeile der Erweiterung (AddonRun)
export const extraName = (id: string) => EXTRAS.find(e => e.id === id)?.name

const Extras: Component = () => {
  const navigate = useNavigate()
  const oeffne = (id: string) => {
    if (!enabledAddonIds().has(id)) setAddonEnabled(id, true)
    navigate(`/addons/${id}`)
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
            <button
              type="button"
              class="rz-setting"
              onClick={() => oeffne(e.id)}
            >
              <span>
                <span class="sl">{e.name}</span>
                <span class="s">{e.satz}</span>
              </span>
              <span class="val">›</span>
            </button>
          )}
        </For>
      </div>
      <A
        href="/settings/erweitert?teil=extras"
        class="rz-aendern rz-block rz-mitte"
      >
        Für Entwickler ›
      </A>
    </div>
  )
}

export default Extras
