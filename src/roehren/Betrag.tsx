// Betrag auf den Röhren eintippen — gemeinsam für Senden und Aufladen (Prototyp keypadScreen: beide
// Bildschirme sind gleich gebaut). Sats oder Euro; Euro rechnet mit dem Kurs, den die Wallet ohnehin lädt.
import type {Component} from 'solid-js'
import {createSignal, For, Show} from 'solid-js'

import {rates} from '../currency'

export const TASTEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'] as const
type Taste = (typeof TASTEN)[number] | ','
export const HOECHSTENS = 9_999_999 // sieben Röhren

export const createBetrag = () => {
  const [eingabe, setEingabe] = createSignal('')
  // Euro: eigene Zeichenkette mit Komma; die Sats rechnet der Kurs aus
  const [wahl, setWahl] = createSignal<'sats' | 'eur'>('sats')
  const [euroText, setEuroText] = createSignal('')
  const [frisch, setFrisch] = createSignal(false)
  const kurs = () => rates()?.eur ?? null // Euro je Bitcoin
  const satsAusEuro = (t: string) => {
    const k = kurs()
    const eur = parseFloat(t.replace(',', '.')) || 0
    return k ? Math.floor((eur / k) * 100_000_000) : 0
  }

  const betrag = () => (wahl() === 'eur' ? satsAusEuro(euroText()) : Number(eingabe() || '0'))

  // wie im Prototyp: die erste Ziffer nach dem Umschalten ersetzt den umgerechneten Wert
  const taste = (t: Taste) => {
    const neuAnfang = frisch() && t !== 'del'
    setFrisch(false)
    if (wahl() === 'eur') {
      let x = neuAnfang ? '' : euroText()
      if (t === 'del') x = x.slice(0, -1)
      else if (t === ',') {
        if (!x.includes(',')) x = (x || '0') + ','
      } else if (!(x.includes(',') && x.split(',')[1].length >= 2) && x.replace(',', '').length < 9) {
        x = (x === '0' ? '' : x) + t
      }
      if (satsAusEuro(x) <= HOECHSTENS) setEuroText(x) // passt sonst nicht mehr auf sieben Röhren
      return
    }
    if (t === 'del') return setEingabe(e => (neuAnfang ? '' : e).slice(0, -1))
    const neu = ((neuAnfang ? '' : eingabe()) + t).replace(/^0+/, '')
    if (Number(neu || '0') <= HOECHSTENS) setEingabe(neu)
  }
  const waehle = (w: 'sats' | 'eur') => {
    if (w === wahl() || (w === 'eur' && !kurs())) return
    if (w === 'eur') {
      const k = kurs()!
      setEuroText(betrag() ? ((betrag() / 100_000_000) * k).toFixed(2).replace('.', ',') : '')
    } else {
      setEingabe(betrag() ? String(betrag()) : '')
    }
    setWahl(w)
    setFrisch(true)
  }
  // fester Betrag in Sats, z. B. „höchstens so viel senden“
  const setzeSats = (sats: number) => {
    setWahl('sats')
    setEingabe(String(sats))
  }
  const euroAnzeige = () => (wahl() === 'eur' ? `${euroText() || '0'} €` : undefined)

  return {betrag, wahl, kurs, taste, waehle, setzeSats, euroAnzeige}
}
export type Betrag = ReturnType<typeof createBetrag>

export const Tastatur: Component<{betrag: Betrag}> = props => (
  <div class="rz-tastatur">
    <For each={TASTEN}>
      {t => {
        // in Euro wird „000“ zum Komma (Prototyp)
        const echt = (): Taste => (t === '000' && props.betrag.wahl() === 'eur' ? ',' : t)
        return (
          <button
            type="button"
            class="rz-taste"
            aria-label={echt() === 'del' ? 'Löschen' : echt()}
            onClick={() => props.betrag.taste(echt())}
          >
            <Show when={t !== 'del'} fallback={<span class="w">⌫</span>}>
              <span class="w">{echt()}</span>
            </Show>
          </button>
        )
      }}
    </For>
  </div>
)
