// Die Kamera-Ansicht von „Rechnung scannen“ (Bezahlen) und „Schein scannen“ (Empfangen) — ein Baustein,
// damit beide gleich aussehen und sich gleich verhalten (Gerhard, 2026-10-29 / 31): Kamera im Rahmen mit
// vier Ecken (Bild ungefiltert, Rahmen und Ecken liegen außen bzw. nur an den Ecken darüber), eine Zeile für
// Hinweise, eine Taste Kamera aus/ein. Was ein gültiger Code ist und was danach geschieht, sagt die Seite.
import type {Component, JSX} from 'solid-js'
import {createSignal, Show} from 'solid-js'

import Scanner, {canScan} from '../components/Scanner'

export const kameraFehlerText = (art: 'verweigert' | 'keine'): string =>
  art === 'keine'
    ? 'Keine Kamera gefunden.'
    : 'Die Kamera ist nicht freigegeben. Erlaube sie in den Website-Einstellungen des Browsers und tippe dann auf „Kamera ein“.'

const Scanansicht: Component<{
  an: boolean // Kamera läuft
  zeile: string | null // Hinweis unter dem Feld (falscher Code, Kamerafehler)
  wartet?: boolean // nach dem Treffer: „Einen Moment …“, Taste gesperrt
  annehmen: (wert: string) => boolean // nur was hier true liefert, beendet das Scannen
  gescannt: (wert: string) => void
  kameraFehler: (art: 'verweigert' | 'keine') => void
  kamera: () => void // Taste Kamera aus/ein
  children?: JSX.Element // unter der Taste (Empfangen: Foto-Ausweg)
}> = props => (
  <>
    <div class="rz-scanfeld">
      <Show
        when={props.an}
        fallback={
          <div class="rz-scan-aus">
            {props.wartet ? 'Einen Moment …' : 'Kamera ist aus'}
          </div>
        }
      >
        <Scanner
          accept={props.annehmen}
          onScan={props.gescannt}
          onFehler={props.kameraFehler}
        />
      </Show>
      <span class="rz-ecke lo" />
      <span class="rz-ecke ro" />
      <span class="rz-ecke lu" />
      <span class="rz-ecke ru" />
    </div>
    <p class="rz-erkannt fremd rz-scan-zeile" aria-live="polite">
      {props.zeile ?? ''}
    </p>
    <button
      type="button"
      class="rz-knopf rz-weiter rz-kamera"
      disabled={!canScan() || props.wartet}
      onClick={() => props.kamera()}
    >
      <span class="lbl">{props.an ? 'Kamera aus' : 'Kamera ein'}</span>
    </button>
    {props.children}
  </>
)

export default Scanansicht

// Kamera-Zustand für eine Seite: an, Hinweiszeile, Fehler und Taste wie bei Rechnung scannen
export const scanZustand = () => {
  const [an, setAn] = createSignal(canScan())
  const [zeile, setZeile] = createSignal<string | null>(
    canScan() ? null : 'Dieser Browser gibt die Kamera nicht frei.'
  )
  return {
    an,
    setAn,
    zeile,
    setZeile,
    kameraFehler: (art: 'verweigert' | 'keine') => {
      setAn(false)
      setZeile(kameraFehlerText(art))
    },
    kamera: () => {
      setZeile(null)
      setAn(s => !s)
    }
  }
}
