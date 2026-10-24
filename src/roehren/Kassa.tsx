// Kassa (Steve, 2026-10-24): dieselbe Tastatur und dasselbe Zählwerk wie Senden, nicht die Tastatur der
// Erweiterung „Point of Sale“. Der Weg ist ihrer: Rechnung von der eigenen Lightning-Adresse anfordern
// (lnaddress.invoice), alle 3 s nachsehen (lnaddress.checkPayment) — bezahlt, holt die Wallet den neuen
// Schein der Adresse gleich ab. Die Erweiterung selbst bleibt unter Für Entwickler.
import type {Component} from 'solid-js'
import {createSignal, For, Match, onCleanup, Show, Switch} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import Qr from '../components/Qr'
import RequireWallet from '../components/RequireWallet'
import {useDevice} from '../DeviceContext'
import {requireDeviceClient} from '../deviceOrchestration'
import {copyToClipboard, notify, NotifyKind} from '../helpers'
import {VERBS, type VerbContext} from '../addons/verbs'
import {registeredAddresses} from '../addressRegistry'
import {serverOf} from '../lnurlcash'
import {offlineMode} from '../offlineMode'
import {useWallet} from '../WalletContext'
import {createBetrag, Tastatur} from './Betrag'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

const ALLE_MS = 3000

type Rechnung = {
  address: string
  amountSat: number
  pr: string
  verify: string | null
}
type Stand = {
  pr: string
  settled: boolean
  mismatch?: boolean
  error?: string
  claimedSats?: number | null
  claimError?: string
}

const zahl = (n: number) => n.toLocaleString('de-DE')

const Kassa: Component = () => {
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
    addon: {id: 'pos', name: 'Kassa'}
  }

  const adressen = () =>
    registeredAddresses().map(a => `${a.username}@${serverOf(a.server)}`)
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null)
  const adresse = () =>
    adressen().includes(gewaehlt() ?? '') ? gewaehlt()! : adressen()[0]

  const ein = createBetrag()
  const betrag = ein.betrag
  const [rechnung, setRechnung] = createSignal<Rechnung | null>(null)
  const [stand, setStand] = createSignal<Stand | null>(null)
  const [arbeitet, setArbeitet] = createSignal(false)

  let uhr: ReturnType<typeof setInterval> | null = null
  const halt = () => {
    if (uhr) clearInterval(uhr)
    uhr = null
  }
  onCleanup(halt)

  const nachsehen = async () => {
    const r = rechnung()
    if (!r?.verify) return
    try {
      const s = (await VERBS['lnaddress.checkPayment'](
        {invoice: r},
        ctx
      )) as Stand
      if (rechnung()?.pr !== s.pr) return // inzwischen neuer Verkauf
      setStand(s)
      if (s.settled || s.mismatch) halt()
    } catch {
      // nächster Takt
    }
  }

  const kassieren = async () => {
    const a = adresse()
    if (!a || !betrag()) return
    setArbeitet(true)
    try {
      const r = (await VERBS['lnaddress.invoice'](
        {address: a, amountSat: betrag()},
        ctx
      )) as Rechnung
      setStand(null)
      setRechnung(r)
      if (r.verify) uhr = setInterval(() => void nachsehen(), ALLE_MS)
    } catch (err) {
      notify((err as Error).message, NotifyKind.ERROR)
    } finally {
      setArbeitet(false)
    }
  }

  const neuerVerkauf = () => {
    halt()
    setRechnung(null)
    setStand(null)
    ein.setzeSats(0)
  }

  const bezahlt = () => stand()?.settled === true

  const ergebnis = () => {
    const s = stand()
    if (!s?.settled) return ''
    if (s.claimError)
      return `Noch nicht in der Wallet (${s.claimError}) — unter Ausgabestellen › Adresse nachsehen.`
    if (s.claimedSats === null || s.claimedSats === undefined)
      return 'Unter Ausgabestellen › Adresse nachsehen, dann liegt der Schein in der Wallet.'
    if (s.claimedSats === 0)
      return 'Schon früher abgeholt — er liegt in der Wallet.'
    return `${zahl(s.claimedSats)} Sats liegen jetzt in deiner Wallet.`
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
      <h2>Kassa</h2>
    </div>
  )

  return (
    <RequireWallet>
      <div class="page rz-senden rz-kassa">
        <Switch>
          <Match when={!adressen().length}>
            {kopf(() => navigate('/extras'))}
            <p class="rz-hinweis">
              Die Kassa nimmt Zahlungen über deine Lightning-Adresse an — leg
              zuerst bei einer Ausgabestelle eine an.
            </p>
            <A href="/mint" class="rz-knopf an rz-weiter rz-link-knopf">
              <span class="lbl">Zu den Ausgabestellen</span>
            </A>
          </Match>

          <Match when={!rechnung()}>
            {kopf(() => navigate('/extras'))}
            <Zaehlwerk
              sats={betrag()}
              sofort
              kalt={!betrag()}
              wahl={ein.wahl()}
              onWahl={ein.kurs() ? ein.waehle : undefined}
              euroAnzeige={ein.euroAnzeige()}
            />
            <Tastatur betrag={ein} />
            <Show
              when={adressen().length > 1}
              fallback={<p class="rz-kassa-an">an {adresse()}</p>}
            >
              <div class="rz-kassa-wahl">
                <For each={adressen()}>
                  {a => (
                    <button
                      type="button"
                      class="rz-chip"
                      classList={{an: a === adresse()}}
                      onClick={() => setGewaehlt(a)}
                    >
                      {a}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!betrag() || arbeitet() || offlineMode()}
              onClick={() => void kassieren()}
            >
              <span class="lbl">
                {arbeitet()
                  ? 'Einen Moment …'
                  : betrag()
                    ? `${zahl(betrag())} Sats kassieren`
                    : 'Kassieren'}
              </span>
            </button>
          </Match>

          <Match when={rechnung() && !bezahlt()}>
            {kopf(neuerVerkauf)}
            <div class="rz-qr">
              <Qr value={`lightning:${rechnung()!.pr}`.toUpperCase()} />
            </div>
            <Zaehlwerk sats={rechnung()!.amountSat} sofort>
              <Show
                when={rechnung()!.verify}
                fallback={
                  <p class="rz-klein">
                    Diese Ausgabestelle meldet Zahlungen nicht von selbst —
                    danach unter Ausgabestellen › Adresse nachsehen.
                  </p>
                }
              >
                <p class="rz-status">
                  <span class="rz-lampe-klein" />{' '}
                  {stand()?.mismatch ? 'Unklar' : 'Wartet auf Zahlung'}
                </p>
                <Show when={stand()?.mismatch}>
                  <p class="rz-klein">
                    Die Ausgabestelle meldet eine andere Rechnung — diesen
                    Verkauf nicht als bezahlt werten, bis du nachgesehen hast.
                  </p>
                </Show>
              </Show>
            </Zaehlwerk>
            <button
              type="button"
              class="rz-leise rz-block rz-mitte"
              onClick={() => void copyToClipboard(rechnung()!.pr)}
            >
              Rechnung kopieren
            </button>
            <button
              type="button"
              class="rz-leise rz-block rz-mitte"
              onClick={neuerVerkauf}
            >
              Abbrechen
            </button>
          </Match>

          <Match when={bezahlt()}>
            {kopf(neuerVerkauf)}
            <div class="rz-fertig">
              <Zaehlwerk sats={rechnung()!.amountSat} sofort>
                <p class="rz-zeile-matt">Bezahlt</p>
                <p class="rz-klein">{ergebnis()}</p>
              </Zaehlwerk>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                onClick={neuerVerkauf}
              >
                <span class="lbl">Neuer Verkauf</span>
              </button>
            </div>
          </Match>
        </Switch>
      </div>
    </RequireWallet>
  )
}

export default Kassa
