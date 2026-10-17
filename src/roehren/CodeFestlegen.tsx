// Code festlegen auf dem Röhrenfeld (Steve, 2026-10-17): dort, wo man ihn später tippt — dann mischt sich
// kein Schlüsselbund ein, und jeder Code ist auch tippbar. Wählen (mindestens 8 Röhrenzeichen), noch
// einmal zur Sicherheit; stimmt es nicht, flackert das Feld und es geht von vorn los. Der Schlüssel unten
// holt einen Vorschlag des Passwortmanagers — der braucht kein Wiederholen (der Manager merkt ihn) und
// keine Röhrenzeichen (er wird nie getippt).
import type {Component, JSX} from 'solid-js'
import {createSignal} from 'solid-js'

import Roehrenfeld from './Roehrenfeld'
import {codeFehler, MINDESTENS, normalisiere, tippbar} from './roehrencode'

const CodeFestlegen: Component<{
  titel: string
  zurueck?: () => void
  // null = übernommen; sonst ein Satz, warum nicht
  onCode: (code: string, ausManager: boolean) => Promise<string | null>
  unten?: JSX.Element
}> = props => {
  const [erster, setErster] = createSignal<string | null>(null)
  const [fehler, setFehler] = createSignal<string | null>(null)

  const nimm = async (code: string, ausManager: boolean) => {
    setFehler(null)
    if (ausManager) {
      if (code.length < MINDESTENS) {
        setFehler(`Mindestens ${MINDESTENS} Zeichen.`)
        return 'falsch' as const
      }
      // tippbar (z. B. Apples Vorschlag): groß speichern — der Manager setzt seine Schreibweise ein, das
      // Schloss probiert auch die große; so geht es notfalls auch auf den Röhren
      const f = await props.onCode(
        tippbar(code) ? normalisiere(code) : code,
        true
      )
      if (f) setFehler(f)
      return f ? ('falsch' as const) : ('weiter' as const)
    }
    const ersterCode = erster()
    if (ersterCode === null) {
      const f = codeFehler(code)
      if (f) {
        setFehler(f)
        return 'falsch' as const
      }
      setErster(code)
      return 'weiter' as const
    }
    setErster(null)
    if (code !== ersterCode) {
      setFehler('Stimmt nicht überein — noch einmal von vorn.')
      return 'falsch' as const
    }
    const f = await props.onCode(normalisiere(code), false)
    if (f) setFehler(f)
    return f ? ('falsch' as const) : ('weiter' as const)
  }

  return (
    <Roehrenfeld
      onCode={nimm}
      aktion="Weiter"
      autocomplete="new-password"
      mindestens={MINDESTENS}
      laenge={erster()?.length ?? null}
      fehlerZeile={fehler()}
      kopf={
        <>
          <div class="rz-seitenkopf">
            {props.zurueck && (
              <button
                type="button"
                class="rz-zurueck"
                aria-label="Zurück"
                onClick={() => props.zurueck?.()}
              >
                ‹
              </button>
            )}
            <h2>{props.titel}</h2>
          </div>
          <p>
            {erster() === null
              ? `Tipp deinen Code — mindestens ${MINDESTENS} Zeichen. Oder nimm mit dem Schlüssel unten einen aus deinem Passwortmanager; den setzt dann nur er ein.`
              : 'Noch einmal, zur Sicherheit.'}
          </p>
        </>
      }
      unten={props.unten}
    />
  )
}

export default CodeFestlegen
