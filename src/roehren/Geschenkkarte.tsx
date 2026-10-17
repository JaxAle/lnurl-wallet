// Geschenkkarte als eigener Bildschirm (Steve, 2026-10-17): wie Senden — Betrag auf den Röhren, dann
// Motiv und Nachricht, dann die Karte als PDF zum Ausdrucken. Die Karte trägt den Schein als QR; er
// steht danach unter „Unterwegs“, bis ihn jemand einlöst, und lässt sich bis dahin zurückholen. Das
// Abspalten ist dasselbe wie beim Senden (abspalten.ts), das PDF baut die Erweiterung des Originals
// (addons/giftcard/pdf.ts), hier mit deutschen Texten.
import type {Component} from 'solid-js'
import {createMemo, createSignal, For, Match, Show, Switch} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {buildGiftCardPdf} from '../addons/giftcard/pdf'
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
import {euroNotiz, kartenText, TEXTE, vorschlag} from './geschenkkarte'
import {css, motiv as motivVon, MOTIVE, type MotivId} from './motive'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

// Vorschau der Karte am Bildschirm — derselbe Aufbau wie das PDF (addons/giftcard/pdf.ts), in mm
// (140 × 90), dieselbe Zeichnung; der QR ist ein Platzhalter, er entsteht erst beim Erstellen
const zeilen = (t: string, n = 38): string[] => {
  const aus: string[] = []
  let z = ''
  for (const w of t.split(/\s+/).filter(Boolean)) {
    if ((z + ' ' + w).trim().length > n && z) {
      aus.push(z)
      z = w
    } else z = (z + ' ' + w).trim()
  }
  if (z) aus.push(z)
  return aus.slice(0, 4)
}
const KartenVorschau: Component<{
  id: MotivId
  sats: number
  euro?: string
  nachricht: string
}> = props => {
  const m = () => motivVon(props.id)
  const textZeilen = () => zeilen(kartenText(props.nachricht))
  const kunstOben = () => 31.4 + 8 + 1.4 + (textZeilen().length - 1) * 4.6
  const kunst = () => Math.min(34, 79.2 - kunstOben())
  return (
    <svg
      class="rz-karte"
      viewBox="0 0 140 90"
      role="img"
      aria-label={`Vorschau der Karte, Motiv ${m().name}`}
      font-family="Helvetica, Arial, sans-serif"
    >
      <rect width="140" height="90" fill={css(m().bg)} />
      <rect width="5" height="90" fill={css(m().accent)} />
      <text
        x="13"
        y="11.5"
        font-size="3.9"
        font-weight="700"
        fill={css(m().accent)}
      >
        {TEXTE.title}
      </text>
      <text
        x="13"
        y="22.8"
        font-size="9.2"
        font-weight="700"
        fill={css(m().text)}
      >
        {TEXTE.amount(props.sats)}
      </text>
      <Show when={props.euro}>
        <text
          x="13"
          y="28.5"
          font-size="3.2"
          fill={css(m().text)}
          opacity="0.75"
        >
          {props.euro}
        </text>
      </Show>
      <For each={textZeilen()}>
        {(z, i) => (
          <text
            x="13"
            y={34.8 + i() * 4.6}
            font-size="3.5"
            fill={css(m().text)}
          >
            {z}
          </text>
        )}
      </For>
      <Show when={m().zeichnung.length > 0 && kunst() > 10}>
        <g
          transform={`translate(13 ${79.2 - kunst()}) scale(${kunst() / 100})`}
          fill="none"
          stroke={css(m().draht)}
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <For each={m().zeichnung}>{d => <path d={d} />}</For>
        </g>
      </Show>
      <text x="92" y="37.5" font-size="2.3" fill={css(m().text)}>
        {TEXTE.scan}
      </text>
      <rect x="92" y="39.2" width="40" height="40" fill="#fff" />
      <rect x="95" y="42.2" width="34" height="34" fill="#c9c9c9" />
      <text x="13" y="84.5" font-size="2.1" fill={css(m().text)} opacity="0.7">
        {TEXTE.footer}
      </text>
    </svg>
  )
}

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
  const [motiv, setMotiv] = createSignal<MotivId>(vorschlag())
  // die Nachricht folgt dem Motiv, solange man sie nicht selbst geändert hat (Steve)
  const [eigene, setEigene] = createSignal<string | null>(null)
  const nachricht = () => eigene() ?? motivVon(motiv()).nachricht
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
      'classic',
      s.url,
      {
        ...TEXTE,
        amountNote: euroNotiz(Math.floor(s.amount / 1000), ein.kurs())
      },
      (({bg, accent, text, zeichnung, draht}) => ({
        bg,
        accent,
        text,
        art: zeichnung,
        artColor: draht
      }))(motivVon(motiv()))
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
            <KartenVorschau
              id={motiv()}
              sats={betrag()}
              euro={euroNotiz(betrag(), ein.kurs())}
              nachricht={nachricht()}
            />
            <span class="rz-feldname">Anlass</span>
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
                        background: css(m.bg),
                        'border-color': css(m.accent)
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
              onInput={e => setEigene(e.currentTarget.value)}
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
