// Tombola (Steve, 2026-10-25): ein Bildschirm wie die Geschenkkarte statt des Formulars der Erweiterung
// „Raffle“ (Preisstufen, Marge, Gebührenfelder, vier englische Vorlagen). Drei Fragen: wie viel in den
// Topf, wie viele Lose, wie verteilt. Der Weg ist der der Erweiterung: ein Schein wird in die Lose geteilt
// (note.split, Reihenfolge gemischt durch planTickets), die Lose kommen als PDF zum Ausdrucken. Die Lose
// stehen danach unter „Unterwegs“ — nicht eingelöste lassen sich nach dem Fest zurückholen.
import type {Component} from 'solid-js'
import {createMemo, createSignal, For, Match, Show, Switch} from 'solid-js'
import {useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import {useDevice} from '../DeviceContext'
import {requireDeviceClient} from '../deviceOrchestration'
import {notify, NotifyKind} from '../helpers'
import {VERBS, type VerbContext} from '../addons/verbs'
import {planTickets, type PrizeTier} from '../addons/raffle/lottery'
import {buildTicketPdf, type TicketTexte} from '../addons/raffle/pdf'
import {serverOf} from '../lnurlcash'
import type {Bearer} from '../storage'
import {useWallet} from '../WalletContext'
import {createBetrag, Tastatur} from './Betrag'
import {merkeUnterwegs} from './einloesen'
import {teilGebuehrMsat} from './gebuehren'
import {gebunden} from './klaerung'
import {Schalter} from './Bedienfeld'
import Zaehlwerk from './Zaehlwerk'
import {
  anzahl,
  ARTEN,
  lospreis,
  summe,
  verteile,
  zeile,
  type Art
} from './tombola'
import './roehren.css'

const zahl = (n: number) => n.toLocaleString('de-DE')

const TEXTE: TicketTexte = {
  untertitel: 'Tombola mit LNURLcash',
  erklaerung:
    'Jedes Los auf den folgenden Seiten ist ein eigener LNURLcash-Schein: ' +
    'wer das Los hat, hat den Preis. Den QR-Code mit einer Lightning-Wallet ' +
    'scannen, die LNURL kann, und einlösen - ohne Anmeldung beim Veranstalter.',
  summe: (lose, sats) => `${lose} Lose, ${sats} Sats im Topf`,
  stufen: 'Preise',
  los: nr => `Los Nr. ${nr}`,
  einheit: 'Sats'
}

const ladeHerunter = (pdf: Uint8Array, name: string) => {
  const url = URL.createObjectURL(
    new Blob([pdf as BlobPart], {type: 'application/pdf'})
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

type Los = {
  id: string
  url: string
  label: string
  index: number
  amountSat: number
}

const Tombola: Component = () => {
  const navigate = useNavigate()
  const wallet = useWallet()
  const {client} = useDevice()
  const ctx: VerbContext = {
    bearers: wallet.bearers,
    addBearer: wallet.addBearer,
    updateBearer: wallet.updateBearer,
    removeBearer: wallet.removeBearer,
    logActivity: wallet.logActivity,
    deviceClient: client,
    requireDeviceClient,
    addon: {id: 'raffle', name: 'Tombola'}
  }

  const ein = createBetrag()
  const topf = ein.betrag
  const [schritt, setSchritt] = createSignal<'topf' | 'lose' | 'fertig'>('topf')
  const [lose, setLose] = createSignal(20)
  const [art, setArt] = createSignal<Art>('klassisch')
  const [titel, setTitel] = createSignal(
    `Tombola ${new Date().toLocaleDateString('de-AT')}`
  )
  const [betragDrauf, setBetragDrauf] = createSignal(true)
  const [arbeitet, setArbeitet] = createSignal(false)
  const [fertig, setFertig] = createSignal<Los[]>([])

  // wie bei Senden und Geschenkkarte: nur geprüfte Browser-Scheine ohne offenen Vorgang
  const verfuegbar = createMemo(() => {
    const g = gebunden()
    return wallet
      .bearers()
      .filter(b => !b.spent && !b.deviceId && b.verified && !g.has(b.id))
  })
  const groesster = () =>
    Math.floor(Math.max(0, ...verfuegbar().map(b => b.amount)) / 1000)

  const stufen = createMemo(() => verteile(art(), topf(), lose()))

  // geteilt wird ein Schein; was übrig bleibt, ist Wechselgeld. Er muss mehr wert sein als die Lose
  // zusammen plus die Teilgebühr je Los (zuletzt gemessen)
  const quelle = createMemo(() => {
    const s = stufen()
    if (!s) return null
    const noetig = (b: Bearer) =>
      summe(s) * 1000 + anzahl(s) * teilGebuehrMsat(serverOf(b.url))
    return (
      verfuegbar()
        .filter(b => b.amount > noetig(b))
        .sort((a, b) => a.amount - b.amount)[0] ?? null
    )
  })
  const zuViel = () => topf() >= groesster()

  const pdf = (l: Los[], s: PrizeTier[]) =>
    buildTicketPdf(
      titel().trim() || 'Tombola',
      l,
      betragDrauf(),
      'a4',
      s,
      TEXTE
    )

  const erstellen = async () => {
    const s = stufen()
    const q = quelle()
    if (!s || !q) return
    setArbeitet(true)
    try {
      const l = (await VERBS['note.split'](
        {note: q.id, tickets: planTickets(s, crypto.randomUUID())},
        ctx
      )) as Los[]
      for (const x of l) merkeUnterwegs(x.id)
      setFertig(l)
      setSchritt('fertig')
      ladeHerunter(await pdf(l, s), `tombola-${l.length}-lose.pdf`)
    } catch (err) {
      notify(
        `Die Lose gehen gerade nicht: ${(err as Error).message}`,
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
      <h2>Tombola</h2>
    </div>
  )

  return (
    <RequireWallet>
      <div class="page rz-senden rz-tombola">
        <Switch>
          <Match when={schritt() === 'topf'}>
            {kopf(() => navigate('/extras'))}
            <Zaehlwerk
              sats={topf()}
              sofort
              kalt={!topf() || zuViel()}
              wahl={ein.wahl()}
              onWahl={ein.kurs() ? ein.waehle : undefined}
              euroAnzeige={ein.euroAnzeige()}
            >
              <Show
                when={topf() > 0 && zuViel()}
                fallback={
                  <p class="rz-zeile-matt">So viel kommt in den Topf</p>
                }
              >
                <div class="rz-ueber">
                  <span>Dein größter Schein hat {zahl(groesster())} Sats</span>
                </div>
              </Show>
            </Zaehlwerk>
            <Tastatur betrag={ein} />
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!topf() || zuViel()}
              onClick={() => setSchritt('lose')}
            >
              <span class="lbl">Weiter</span>
            </button>
          </Match>

          <Match when={schritt() === 'lose'}>
            {kopf(() => setSchritt('topf'))}
            <p class="rz-status rz-mitte">{zahl(topf())} Sats im Topf</p>

            <label class="rz-feldname">Wie viele Lose?</label>
            <div class="rz-lose-zahl">
              <button
                type="button"
                class="rz-chip"
                aria-label="Ein Los weniger"
                onClick={() => setLose(n => Math.max(1, n - 1))}
              >
                −
              </button>
              <span class="rz-lose-wert">{lose()}</span>
              <button
                type="button"
                class="rz-chip"
                aria-label="Ein Los mehr"
                onClick={() => setLose(n => Math.min(200, n + 1))}
              >
                +
              </button>
              <For each={[10, 20, 30, 50]}>
                {n => (
                  <button
                    type="button"
                    class="rz-chip"
                    classList={{an: lose() === n}}
                    onClick={() => setLose(n)}
                  >
                    {n}
                  </button>
                )}
              </For>
            </div>

            <label class="rz-feldname">Wie wird verteilt?</label>
            <For each={ARTEN}>
              {a => {
                const s = () => verteile(a.id, topf(), lose())
                return (
                  <button
                    type="button"
                    class="rz-option rz-wahl-karte"
                    classList={{an: art() === a.id}}
                    disabled={!s()}
                    onClick={() => setArt(a.id)}
                  >
                    <span class="rz-wahl-punkt" aria-hidden="true" />
                    <span>
                      <span class="t">{a.titel}</span>
                      <span class="s">
                        {s() ? zeile(s()!) : 'geht mit so wenigen Losen nicht'}
                      </span>
                    </span>
                    <span />
                  </button>
                )
              }}
            </For>

            <Show when={stufen()}>
              {s => (
                <p class="rz-hinweis">
                  Lospreis, damit der Topf gedeckt ist: ab{' '}
                  {zahl(lospreis(summe(s()), anzahl(s())))} Sats
                  <Show when={summe(s()) < topf()}>
                    {' '}
                    · im Topf {zahl(summe(s()))} Sats (gerundet)
                  </Show>
                </p>
              )}
            </Show>

            <label class="rz-feldname" for="tb-titel">
              Name auf den Losen
            </label>
            <input
              id="tb-titel"
              class="rz-feld"
              type="text"
              value={titel()}
              onInput={e => setTitel(e.currentTarget.value)}
            />
            <Schalter
              label="Betrag aufs Los drucken"
              unter="Sonst sieht man ihn erst beim Scannen"
              an={betragDrauf()}
              onClick={() => setBetragDrauf(!betragDrauf())}
            />

            {/* Vorschau eines Loses, wie es auf dem Bogen steht (vier je Reihe) */}
            <div class="rz-los-vorschau" aria-hidden="true">
              <div class="rz-los">
                <div class="rz-los-qr" />
                <b>{titel().trim() || 'Tombola'}</b>
                <span>Los Nr. 001</span>
                <Show when={betragDrauf() && stufen()}>
                  <span>{zahl(stufen()!.at(-1)!.amountSat)} Sats</span>
                </Show>
              </div>
            </div>

            <Show when={stufen() && !quelle()}>
              <p class="rz-hinweis">
                Kein einzelner Schein reicht für Lose und Teilgebühr — leg
                Scheine derselben Stelle zusammen oder lade auf.
              </p>
            </Show>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!stufen() || !quelle() || arbeitet()}
              onClick={() => void erstellen()}
            >
              <span class="lbl">
                {arbeitet()
                  ? 'Lose werden geteilt …'
                  : `${lose()} Lose erstellen`}
              </span>
            </button>
          </Match>

          <Match when={schritt() === 'fertig'}>
            {kopf(() => navigate('/extras'))}
            <div class="rz-fertig">
              <Zaehlwerk
                sats={fertig().reduce((a, l) => a + l.amountSat, 0)}
                sofort
              >
                <p class="rz-zeile-matt">{fertig().length} Lose erstellt</p>
                <p class="rz-klein">
                  Die PDF-Datei ist heruntergeladen — ausdrucken und
                  ausschneiden. Die Lose stehen unter „Unterwegs“; nicht
                  eingelöste kannst du nach dem Fest zurückholen.
                </p>
              </Zaehlwerk>
              <button
                type="button"
                class="rz-leise rz-block rz-mitte"
                onClick={() =>
                  void pdf(fertig(), stufen() ?? []).then(b =>
                    ladeHerunter(b, `tombola-${fertig().length}-lose.pdf`)
                  )
                }
              >
                PDF noch einmal herunterladen
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

export default Tombola
