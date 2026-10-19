// Für Entwickler (Steve, 2026-10-19): die alte Erweitert-Seite führte doppelt, was längst in den
// Einstellungen steht (Sperren, Währung, Sicherung, Wallet löschen …). Hier bleibt nur Technisches:
// Offline-Betrieb, Suchtiefe, Hardware-Tresor, und die Erweiterungen, die nicht unter Extras stehen —
// je eine Zeile mit Schalter; eine eingeschaltete öffnet sich beim Antippen. Die Werkstatt (eigene
// Erweiterungen bauen, Einstellungen einzelner Erweiterungen) bleibt im Original, als letzte Zeile.
import type {Component} from 'solid-js'
import {For, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {enabledAddonIds, setAddonEnabled} from '../addons/enabled'
import {
  experimentalAddonsVisible,
  setExperimentalAddonsVisible
} from '../addons/experimentalVisible'
import {allAddons} from '../addons/registry'
import {
  GAP_LIMIT_LABEL,
  GAP_LIMIT_OPTIONS,
  gapLimit,
  setGapLimit
} from '../gapLimit'
import {offlineMode, setOfflineMode} from '../offlineMode'
import {setVaultEnabled, vaultEnabled} from '../vaultFeature'
import {Gruppe, Schalter, Zeile} from './Bedienfeld'
import {EXTRAS} from './Extras'
import './roehren.css'

const weiter = <T,>(reihe: readonly T[], jetzt: T): T =>
  reihe[(reihe.indexOf(jetzt) + 1) % reihe.length]

// stehen schon unter Extras bzw. sind doppelt (Währung steht in den Einstellungen)
const NICHT_HIER = new Set([...EXTRAS.map(e => e.id), 'currency-converter'])

const Entwickler: Component = () => {
  const navigate = useNavigate()
  const werkzeuge = () =>
    allAddons().filter(
      a =>
        !NICHT_HIER.has(a.manifest.id) &&
        (!a.manifest.experimental || experimentalAddonsVisible())
    )
  const an = (id: string) => enabledAddonIds().has(id)

  return (
    <div class="page rz-einstellungen">
      <div class="rz-seitenkopf">
        <A href="/extras" class="rz-zurueck" aria-label="Zurück zu den Extras">
          ‹
        </A>
        <h2>Für Entwickler</h2>
      </div>

      <Gruppe titel="Technik">
        <Schalter
          label="Offline-Betrieb"
          unter="Keine Verbindung zu Ausgabestellen"
          an={offlineMode()}
          onClick={() => setOfflineMode(!offlineMode())}
        />
        <Zeile
          label="Suchtiefe beim Wiederherstellen"
          unter="Leere Nummern hintereinander, bevor die Suche aufhört"
          wert={GAP_LIMIT_LABEL[gapLimit()]}
          onClick={() => setGapLimit(weiter(GAP_LIMIT_OPTIONS, gapLimit()))}
        />
        <Schalter
          label="Hardware-Tresor (Alpha)"
          unter="LNURLvault über USB oder Bluetooth"
          an={vaultEnabled()}
          onClick={() => setVaultEnabled(!vaultEnabled())}
        />
      </Gruppe>

      <Gruppe titel="Erweiterungen">
        <For each={werkzeuge()}>
          {a => (
            <div class="rz-setting rz-erweiterung">
              <button
                type="button"
                class="rz-erweiterung-text"
                onClick={() =>
                  an(a.manifest.id)
                    ? navigate(`/addons/${a.manifest.id}`)
                    : setAddonEnabled(a.manifest.id, true)
                }
              >
                <span class="sl">
                  {a.manifest.name}
                  <Show when={an(a.manifest.id)}> ›</Show>
                </span>
                <span class="s">{a.manifest.description}</span>
              </button>
              <button
                type="button"
                class="rz-erweiterung-schalter"
                role="switch"
                aria-checked={an(a.manifest.id)}
                aria-label={`${a.manifest.name} ${an(a.manifest.id) ? 'ausschalten' : 'einschalten'}`}
                onClick={() =>
                  setAddonEnabled(a.manifest.id, !an(a.manifest.id))
                }
              >
                <span class="rz-switch" classList={{on: an(a.manifest.id)}} />
              </button>
            </div>
          )}
        </For>
        <Schalter
          label="Experimentelle zeigen"
          an={experimentalAddonsVisible()}
          onClick={() =>
            setExperimentalAddonsVisible(!experimentalAddonsVisible())
          }
        />
      </Gruppe>

      <Gruppe titel="Werkstatt">
        <Zeile
          label="Werkstatt"
          unter="Eigene Erweiterungen bauen, Einstellungen einzelner Erweiterungen"
          href="/settings/erweitert?teil=extras"
        />
      </Gruppe>
    </div>
  )
}

export default Entwickler
