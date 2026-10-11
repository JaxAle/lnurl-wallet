// Senden wie im Prototyp (screens.send → send-qr): Betrag auf den Röhren eintippen, die Wallet
// spaltet einen passenden Schein selbst ab (splitBearerIntoAmounts des Originals — eine Gebühr der
// Ausgabestelle geht vom Rest ab, nicht vom übergebenen Betrag), dann der QR. Das Einlösen erkennt
// die Einlöse-Wache; das Zählwerk zählt danach auf der Startseite herunter.
//
// Noch nicht hier (spätere Schleife): Eingabe in Euro, „Als Link teilen“, „Geschenkkarte“.
import type {Component} from 'solid-js'
import {createMemo, createSignal, For, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import Qr from '../components/Qr'
import RequireWallet from '../components/RequireWallet'
import {useDevice} from '../DeviceContext'
import {requireDeviceClient} from '../deviceOrchestration'
import {notify, NotifyKind} from '../helpers'
import {toBech32Lnurl} from '../lnurlcash'
import {splitBearerIntoAmounts} from '../noteSplitting'
import type {Bearer} from '../storage'
import {useWallet} from '../WalletContext'
import {merkeUnterwegs} from './einloesen'
import {holeZurueck} from './zurueckholen'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

const TASTEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'] as const
const HOECHSTENS = 9_999_999 // sieben Röhren

const Senden: Component = () => {
  const {bearers, addBearer, updateBearer, removeBearer, logActivity} = useWallet()
  const {client: deviceClient} = useDevice()
  const navigate = useNavigate()

  const [eingabe, setEingabe] = createSignal('')
  const [arbeitet, setArbeitet] = createSignal(false)
  const [schein, setSchein] = createSignal<Bearer | null>(null)

  const betrag = () => Number(eingabe() || '0')
  // nur Scheine, deren Geheimnis in diesem Browser liegt (kein Vault) — die lassen sich spalten
  const verfuegbar = createMemo(() => bearers().filter(b => !b.spent && !b.deviceId))
  const guthaben = () => Math.floor(verfuegbar().reduce((a, b) => a + b.amount, 0) / 1000)
  const groesster = () => Math.floor(Math.max(0, ...verfuegbar().map(b => b.amount)) / 1000)

  const zuViel = () => betrag() > groesster()
  const grund = () =>
    betrag() > guthaben()
      ? `Mehr als dein Guthaben (${guthaben().toLocaleString('de-AT')})`
      : `Kein einzelner Schein hat so viel — höchstens ${groesster().toLocaleString('de-AT')}`

  const taste = (t: (typeof TASTEN)[number]) => {
    if (t === 'del') return setEingabe(e => e.slice(0, -1))
    const neu = (eingabe() + t).replace(/^0+/, '')
    if (Number(neu || '0') <= HOECHSTENS) setEingabe(neu)
  }

  // genau passender Schein, sonst der kleinste, von dem sich der Betrag abspalten lässt
  // (Spalten verlangt einen Rest: Betrag < Schein)
  const waehleSchein = (msat: number): Bearer | null => {
    const passend = verfuegbar().find(b => b.amount === msat)
    if (passend) return passend
    const groessere = verfuegbar()
      .filter(b => b.amount > msat)
      .sort((a, b) => a.amount - b.amount)
    return groessere[0] ?? null
  }

  const weiter = async () => {
    const msat = betrag() * 1000
    const quelle = waehleSchein(msat)
    if (!quelle) return
    setArbeitet(true)
    try {
      let ziel = quelle
      if (quelle.amount !== msat) {
        const {parts} = await splitBearerIntoAmounts(
          quelle,
          [{amountMsat: msat}],
          {addBearer, updateBearer, removeBearer, logActivity, deviceClient, requireDeviceClient},
          {plain: false}
        )
        ziel = parts[0]
      }
      merkeUnterwegs(ziel.id)
      setSchein(ziel)
    } catch (err) {
      notify(`Senden geht gerade nicht: ${(err as Error).message}`, NotifyKind.ERROR)
    } finally {
      setArbeitet(false)
    }
  }

  // der übergebene Schein, aktuell aus der Wallet — wird er eingelöst, setzt die Wache "spent"
  const aktuell = () => {
    const s = schein()
    return s ? (bearers().find(b => b.id === s.id) ?? s) : null
  }
  const eingeloest = () => !!aktuell()?.spent

  // „Doch nicht senden“: Schein erneuern, der gezeigte QR wird wertlos (Gerhard am Pixel, 2026-10-11)
  const [holt, setHolt] = createSignal(false)
  const [zurueck, setZurueck] = createSignal(false)
  const zurueckholen = async () => {
    const s = aktuell()
    if (!s) return
    setHolt(true)
    try {
      const ergebnis = await holeZurueck(s, {addBearer, updateBearer, logActivity})
      if (ergebnis === 'zurueck') setZurueck(true)
      // 'schon-eingeloest': der Schein steht nun auf "spent", die Seite zeigt „eingelöst“
    } catch (err) {
      notify(`Zurückholen geht gerade nicht: ${(err as Error).message}`, NotifyKind.ERROR)
    } finally {
      setHolt(false)
    }
  }

  return (
    <RequireWallet>
    <div class="page rz-senden">
      <Show
        when={aktuell()}
        fallback={
          <>
            <div class="rz-seitenkopf">
              <A href="/wallet" class="rz-zurueck" aria-label="Zurück zur Wallet">
                ‹
              </A>
              <h2>Senden</h2>
            </div>
            <Zaehlwerk sats={betrag()} sofort kalt={!betrag() || zuViel()}>
              <Show when={betrag() > 0 && zuViel()}>
                <div class="rz-ueber">
                  <span>{grund()}</span>
                </div>
                <Show when={groesster() > 0 && betrag() <= guthaben()}>
                  <button
                    type="button"
                    class="rz-leise"
                    onClick={() => setEingabe(String(groesster()))}
                  >
                    {groesster().toLocaleString('de-AT')} senden
                  </button>
                </Show>
              </Show>
            </Zaehlwerk>
            <div class="rz-tastatur">
              <For each={TASTEN}>
                {t => (
                  <button
                    type="button"
                    class="rz-taste"
                    aria-label={t === 'del' ? 'Löschen' : t}
                    onClick={() => taste(t)}
                  >
                    <Show when={t !== 'del'} fallback={<span class="w">⌫</span>}>
                      <span class="w">{t}</span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!betrag() || zuViel() || arbeitet()}
              onClick={() => void weiter()}
            >
              <span class="lbl">{arbeitet() ? 'Einen Moment …' : 'Weiter'}</span>
            </button>
            <button type="button" class="rz-leise" onClick={() => navigate('/wallet?bezahlen=1')}>
              Rechnung oder Adresse bekommen? bezahlen ›
            </button>
          </>
        }
      >
        {s => (
          <Show
            when={!zurueck()}
            fallback={
              <div class="rz-fertig">
                <Zaehlwerk sats={Math.floor(s().amount / 1000)} sofort kalt />
                <p class="rz-hinweis">Zurückgeholt — der gezeigte QR ist wertlos, der Betrag bleibt bei dir.</p>
                <button type="button" class="rz-knopf an rz-weiter" onClick={() => navigate('/wallet')}>
                  <span class="lbl">Fertig</span>
                </button>
              </div>
            }
          >
          <Show
            when={!eingeloest()}
            fallback={
              <div class="rz-fertig">
                <Zaehlwerk sats={Math.floor(s().amount / 1000)} sofort />
                <p class="rz-hinweis">Der Empfänger hat den Schein eingelöst.</p>
                <button type="button" class="rz-knopf an rz-weiter" onClick={() => navigate('/wallet')}>
                  <span class="lbl">Fertig</span>
                </button>
              </div>
            }
          >
            <div class="rz-seitenkopf">
              <h2>Schein zeigen</h2>
            </div>
            <div class="rz-qr">
              <Qr value={toBech32Lnurl(s().url)} />
            </div>
            <Zaehlwerk sats={Math.floor(s().amount / 1000)} sofort />
            <p class="rz-status">
              <span class="rz-lampe-klein" /> Wartet, bis der Schein eingelöst ist
            </p>
            <p class="rz-hinweis">
              Die Wallet fragt nach, solange sie offen ist. Du kannst auch schon zurück — dann
              steht der Schein im Verlauf unter „Unterwegs“.
            </p>
            <button type="button" class="rz-leise" onClick={() => navigate('/wallet')}>
              Zurück zur Wallet
            </button>
            <button
              type="button"
              class="rz-leise"
              disabled={holt()}
              onClick={() => void zurueckholen()}
            >
              {holt() ? 'Einen Moment …' : 'Doch nicht senden, Schein zurückholen'}
            </button>
          </Show>
          </Show>
        )}
      </Show>
    </div>
    </RequireWallet>
  )
}

export default Senden
