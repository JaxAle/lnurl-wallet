// Geschenkkarte als eigener Bildschirm (Steve, 2026-10-17): wie Senden — Betrag auf den Röhren, dann
// Motiv und Nachricht, dann die Karte als PDF zum Ausdrucken. Die Karte trägt den Schein als QR; er
// steht danach unter „Unterwegs“, bis ihn jemand einlöst, und lässt sich bis dahin zurückholen. Das
// Abspalten ist dasselbe wie beim Senden (abspalten.ts), das PDF baut die Erweiterung des Originals
// (addons/giftcard/pdf.ts), hier mit deutschen Texten.
import type {Component} from 'solid-js'
import {createMemo, createSignal, For, Match, Show, Switch} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {
  buildGiftCardPdf,
  GIFT_CARD_TEMPLATES,
  type GiftCardTemplate
} from '../addons/giftcard/pdf'
import RequireWallet from '../components/RequireWallet'
import {useDevice} from '../DeviceContext'
import {requireDeviceClient} from '../deviceOrchestration'
import {notify, NotifyKind} from '../helpers'
import {serverOf} from '../lnurlcash'
import type {Bearer} from '../storage'
import {useWallet} from '../WalletContext'
import {scheinUeber, waehleSchein} from './abspalten'
import {createBetrag, Tastatur} from './Betrag'
import {merkeUnterwegs} from './einloesen'
import {gebunden} from './klaerung'
import {kartenText, TEXTE} from './geschenkkarte'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

const MOTIVE: {id: GiftCardTemplate; name: string}[] = [
  {id: 'classic', name: 'Klassisch'},
  {id: 'festive', name: 'Festlich'},
  {id: 'birthday', name: 'Geburtstag'},
  {id: 'ocean', name: 'Ozean'},
  {id: 'minimal', name: 'Schlicht'}
]
const farbe = (id: GiftCardTemplate, teil: 'bg' | 'accent') =>
  `rgb(${GIFT_CARD_TEMPLATES[id][teil].map(x => Math.round(x * 255)).join(',')})`

const ladeHerunter = (pdf: Uint8Array, sats: number) => {
  const url = URL.createObjectURL(
    new Blob([pdf as BlobPart], {type: 'application/pdf'})
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `geschenkkarte-${sats}-sats.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const Geschenkkarte: Component = () => {
  const {bearers, addBearer, updateBearer, removeBearer, logActivity} =
    useWallet()
  const {client: deviceClient} = useDevice()
  const navigate = useNavigate()
  const ein = createBetrag()
  const betrag = ein.betrag
  const [schritt, setSchritt] = createSignal<'betrag' | 'gestalten' | 'fertig'>(
    'betrag'
  )
  const [motiv, setMotiv] = createSignal<GiftCardTemplate>('classic')
  const [nachricht, setNachricht] = createSignal('Viel Freude mit deinen Sats!')
  const [arbeitet, setArbeitet] = createSignal(false)
  const [schein, setSchein] = createSignal<Bearer | null>(null)

  // wie beim Senden: nur geprüfte Browser-Scheine, die an keinem offenen Vorgang hängen
  const verfuegbar = createMemo(() => {
    const g = gebunden()
    return bearers().filter(
      b => !b.spent && !b.deviceId && b.verified && !g.has(b.id)
    )
  })
  const guthaben = () =>
    Math.floor(verfuegbar().reduce((a, b) => a + b.amount, 0) / 1000)
  const groesster = () =>
    Math.floor(Math.max(0, ...verfuegbar().map(b => b.amount)) / 1000)
  const zuViel = () => betrag() > groesster()

  const pdf = (s: Bearer) =>
    buildGiftCardPdf(
      kartenText(nachricht().trim()),
      Math.floor(s.amount / 1000),
      motiv(),
      s.url,
      TEXTE
    )

  const erstellen = async () => {
    const msat = betrag() * 1000
    const quelle = waehleSchein(verfuegbar(), msat)
    if (!quelle) return
    setArbeitet(true)
    try {
      const s = await scheinUeber(quelle, msat, {
        bearers,
        addBearer,
        updateBearer,
        removeBearer,
        logActivity,
        deviceClient,
        requireDeviceClient
      })
      if (!s) return
      await updateBearer(s.id, {label: 'Geschenkkarte'})
      merkeUnterwegs(s.id)
      logActivity(
        'refresh',
        `Geschenkkarte über ${betrag().toLocaleString('de-DE')} Sats erstellt (${serverOf(s.url)}).`,
        'Geschenkkarte'
      )
      setSchein(s)
      setSchritt('fertig')
      ladeHerunter(await pdf(s), Math.floor(s.amount / 1000))
    } catch (err) {
      notify(
        `Die Karte geht gerade nicht: ${(err as Error).message}`,
        NotifyKind.ERROR
      )
    } finally {
      setArbeitet(false)
    }
  }

  const kopf = (zurueck: () => void) => (
    <div class="rz-seitenkopf">
      <button
        type="button"
        class="rz-zurueck"
        aria-label="Zurück"
        onClick={zurueck}
      >
        ‹
      </button>
      <h2>Geschenkkarte</h2>
    </div>
  )

  return (
    <RequireWallet>
      <div class="page rz-senden rz-geschenk">
        <Switch>
          <Match when={schritt() === 'betrag'}>
            {kopf(() => navigate('/extras'))}
            <Zaehlwerk
              sats={betrag()}
              sofort
              kalt={!betrag() || zuViel()}
              wahl={ein.wahl()}
              onWahl={ein.kurs() ? ein.waehle : undefined}
              euroAnzeige={ein.euroAnzeige()}
            >
              <Show when={betrag() > 0 && zuViel()}>
                <div class="rz-ueber">
                  <span>
                    {betrag() > guthaben()
                      ? `Mehr als dein Guthaben (${guthaben().toLocaleString('de-DE')})`
                      : `Kein einzelner Schein hat so viel — höchstens ${groesster().toLocaleString('de-DE')}`}
                  </span>
                </div>
              </Show>
            </Zaehlwerk>
            <Tastatur betrag={ein} />
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!betrag() || zuViel()}
              onClick={() => setSchritt('gestalten')}
            >
              <span class="lbl">Weiter</span>
            </button>
          </Match>

          <Match when={schritt() === 'gestalten'}>
            {kopf(() => setSchritt('betrag'))}
            <p class="rz-text rz-mitte">
              <b>{betrag().toLocaleString('de-DE')} Sats</b> zum Verschenken
            </p>
            <span class="rz-feldname">Motiv</span>
            <div class="rz-motive">
              <For each={MOTIVE}>
                {m => (
                  <button
                    type="button"
                    class="rz-motiv"
                    classList={{an: motiv() === m.id}}
                    aria-pressed={motiv() === m.id}
                    onClick={() => setMotiv(m.id)}
                  >
                    <span
                      class="rz-motiv-farbe"
                      style={{
                        background: farbe(m.id, 'bg'),
                        'border-color': farbe(m.id, 'accent')
                      }}
                    />
                    {m.name}
                  </button>
                )}
              </For>
            </div>
            <label class="rz-feldname" for="gk-nachricht">
              Nachricht auf der Karte
            </label>
            <textarea
              id="gk-nachricht"
              class="rz-feld rz-feld-text"
              rows="3"
              maxLength={160}
              value={nachricht()}
              onInput={e => setNachricht(e.currentTarget.value)}
            />
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={arbeitet()}
              onClick={() => void erstellen()}
            >
              <span class="lbl">
                {arbeitet() ? 'Einen Moment …' : 'Karte erstellen'}
              </span>
            </button>
          </Match>

          <Match when={schritt() === 'fertig'}>
            <div class="rz-fertig">
              <Zaehlwerk sats={betrag()} sofort>
                <p class="rz-zeile-matt">Geschenkkarte erstellt</p>
                <p class="rz-klein">
                  Die PDF-Datei ist heruntergeladen — ausdrucken und
                  verschenken.
                </p>
              </Zaehlwerk>
              <p class="rz-hinweis">
                Der Schein steht unter „Unterwegs“, bis jemand ihn einlöst. Bis
                dahin kannst du ihn zurückholen — dann ist die Karte wertlos.
              </p>
              <button
                type="button"
                class="rz-leise"
                onClick={async () => {
                  const s = schein()
                  if (s) ladeHerunter(await pdf(s), Math.floor(s.amount / 1000))
                }}
              >
                Karte noch einmal herunterladen
              </button>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                onClick={() => navigate('/wallet')}
              >
                <span class="lbl">Zur Wallet</span>
              </button>
            </div>
          </Match>
        </Switch>
      </div>
    </RequireWallet>
  )
}

export default Geschenkkarte
