// Eine Fallblatt-Klappe (Gerhard, 2026-10-25: „kannst du das Umblättern darstellen?“). Vier Teile wie bei
// der echten Anzeige: oben fest das neue Zeichen, unten fest das alte; dazwischen fällt die obere Hälfte
// des alten Zeichens um die Fuge nach unten, die untere Hälfte des neuen kommt von oben herab. Wechselt das
// Zeichen, klappert die Karte in der Reihenfolge der Tafel bis zum Ziel — höchstens ein paar Schritte, damit
// es schnell bleibt. Nur in der Haut „Fallblatt“; die Röhren zeichnen ihr Zeichen selbst.
import type {Component} from 'solid-js'
import {
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show
} from 'solid-js'

import {ZEICHEN} from './roehrencode'

const FLIP_MS = 110 // ein Klapp: halb fällt die alte Hälfte, halb kommt die neue
const HOECHSTENS = 6 // Schritte bis zum Ziel

const ruhig = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

// die Zeichen vor dem Ziel in der Reihenfolge der Tafel; fremde Zeichen (b, y) über ein paar zufällige
const weg = (von: string, nach: string, schritte?: number): string[] => {
  const ziel = ZEICHEN.indexOf(nach.toUpperCase())
  if (ziel < 0 || nach !== nach.toUpperCase()) {
    const zufall = Array.from(
      {length: schritte ?? 4},
      () => ZEICHEN[Math.floor(Math.random() * ZEICHEN.length)]
    )
    return [...zufall, nach]
  }
  const start = ZEICHEN.indexOf(von)
  let n =
    schritte ??
    (start < 0 ? 4 : (ziel - start + ZEICHEN.length) % ZEICHEN.length)
  if (n === 0) n = 1
  n = Math.min(n, HOECHSTENS)
  return Array.from(
    {length: n},
    (_, k) => ZEICHEN[(ziel - n + 1 + k + ZEICHEN.length) % ZEICHEN.length]
  )
}

const Haelfte: Component<{z: string; teil: string}> = props => (
  <span class={`fb-h ${props.teil}`}>
    <span class="fb-voll">
      <span class="ch">{props.z}</span>
    </span>
  </span>
)

const Klappe: Component<{
  z: string
  verzug?: number // Sekunden bis zum ersten Klapp
  anfang?: number // so viele Klapps beim Erscheinen (0: steht gleich)
  einmal?: boolean // beim Erscheinen genau ein Klapp auf dasselbe Zeichen (Tippen)
}> = props => {
  const [oben, setOben] = createSignal(props.z) // oben fest: das neue Zeichen
  const [unten, setUnten] = createSignal(props.z) // unten fest: bis zum Ende des Klapps das alte
  const [klapp, setKlapp] = createSignal<{
    n: number
    alt: string
    neu: string
  } | null>(null)
  let uhr: ReturnType<typeof setTimeout> | null = null
  let n = 0
  onCleanup(() => uhr && clearTimeout(uhr))

  let laeuft = false
  const laufe = (folge: string[], warte = 0) => {
    if (uhr) clearTimeout(uhr)
    laeuft = true
    if (ruhig()) {
      laeuft = false
      setOben(props.z)
      setUnten(props.z)
      setKlapp(null)
      return
    }
    let alt = unten()
    const schritt = (k: number) => {
      if (k >= folge.length) {
        laeuft = false
        setKlapp(null)
        // angekommen — aber vielleicht wurde das Ziel inzwischen ein anderes (richtiger Code, während die
        // Karte noch einklapperte): dann gleich weiter dorthin (Gerhard am Pixel: kein LN · URL · CASH)
        if (unten() !== props.z) laufe(weg(unten(), props.z))
        return
      }
      const neu = folge[k]
      setOben(neu)
      setUnten(alt)
      setKlapp({n: ++n, alt, neu})
      uhr = setTimeout(() => {
        setUnten(neu)
        alt = neu
        schritt(k + 1)
      }, FLIP_MS)
    }
    uhr = setTimeout(() => schritt(0), warte)
  }

  onMount(() => {
    const warte = (props.verzug ?? 0) * 1000
    if (props.einmal) return laufe([props.z], 0)
    if (props.anfang) {
      const vor = weg('', props.z, props.anfang)
      setOben(vor[0])
      setUnten(vor[0])
      laufe(vor.slice(1), warte)
    }
  })
  // neues Ziel: steht die Karte, klappert sie los; klappert sie gerade, holt das Ende sie dorthin
  createEffect(
    on(
      () => props.z,
      z => {
        if (!laeuft && z !== unten()) laufe(weg(unten(), z))
      },
      {defer: true}
    )
  )

  return (
    <span class="fb-klappe" style={{'--fb-flip': `${FLIP_MS}ms`}}>
      <Haelfte z={oben()} teil="fb-oben" />
      <Haelfte z={unten()} teil="fb-unten" />
      <Show when={klapp()} keyed>
        {k => (
          <>
            <Haelfte z={k.alt} teil="fb-oben fb-fall" />
            <Haelfte z={k.neu} teil="fb-unten fb-komm" />
          </>
        )}
      </Show>
    </span>
  )
}

export default Klappe
