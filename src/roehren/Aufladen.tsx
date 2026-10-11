// Aufladen wie im Prototyp (screens.topup → invoice): gebaut wie Senden — Betrag auf den Röhren,
// darunter leise die Ausgabestelle, dann „Rechnung erstellen“; danach QR, Betrag und „Wartet auf
// Zahlung“. Ist bezahlt, holt das Original den Schein ab und geht zur Wallet, die hinaufzählt.
//
// Nur das Bild ist hier. Rechnung, Geheimnis, Nachfragen und Abholen bleiben unverändert in
// pages/Mint.tsx (dort kommt der „Motor“ her); die Verwaltung der Ausgabestellen bleibt unter /mint.
import type {Accessor, Component} from 'solid-js'
import {createEffect, createMemo, createSignal, on, Show, untrack} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import Qr from '../components/Qr'
import RequireWallet from '../components/RequireWallet'
import {copyToClipboard} from '../helpers'
import type {PayRequestInfo} from '../lnurlcash'
import {serverOf} from '../lnurlcash'
import {offlineMode} from '../offlineMode'
import {trustedMints} from '../trustedMints'
import {createBetrag, Tastatur} from './Betrag'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

export type AufladeMotor = {
  payRequest: Accessor<PayRequestInfo | null>
  invoice: Accessor<string | null>
  busy: Accessor<boolean>
  // true, sobald die Ausgabestelle selbst nachfragen lässt (LUD-21) — sonst muss man „abholen“
  pruefbar: Accessor<boolean>
  abholbar: Accessor<boolean>
  // was die Rechnung kostet: Schein + Gebühr der Ausgabestelle
  aufteilung: Accessor<{netMsat: number; grossMsat: number; feeMsat: number} | null>
  ausgabestelle: (adresse: string) => Promise<void>
  betrag: (sats: number) => void
  rechnung: () => Promise<void>
  pruefen: () => void
  abholen: () => void
  abbrechen: () => void
  adresseFuer: (server: string) => string
}

const sats = (msat: number) => Math.floor(msat / 1000)

const Aufladen: Component<{motor: AufladeMotor}> = props => {
  const m = props.motor
  const navigate = useNavigate()
  const ein = createBetrag()
  const [stelle, setStelle] = createSignal(0)
  const ziel = () => trustedMints()[stelle() % Math.max(1, trustedMints().length)]

  // die Ausgabestelle gleich beim Öffnen fragen (ein GET): dann sind Grenzen und Gebühr bekannt,
  // bevor jemand tippt
  // nur bei einem Wechsel der Stelle: die Nachfrage frischt die Liste der vertrauten Stellen auf,
  // ohne Memo fragte das endlos weiter (Browser, 2026-10-11)
  const server = createMemo(() => ziel()?.server)
  createEffect(
    on(server, s => {
      if (s && !untrack(offlineMode)) void m.ausgabestelle(m.adresseFuer(s))
    })
  )
  createEffect(() => m.betrag(ein.betrag()))

  const grenzen = () => {
    const info = m.payRequest()
    return info ? {min: sats(info.minSendable), max: sats(info.maxSendable)} : null
  }
  const ausserhalb = () => {
    const g = grenzen()
    const b = ein.betrag()
    return !!g && b > 0 && (b < g.min || b > g.max)
  }
  const gebuehr = () => {
    const a = m.aufteilung()
    return a && a.feeMsat > 0 ? sats(a.feeMsat) : 0
  }

  const zurueck = () => {
    m.abbrechen()
    navigate('/wallet')
  }

  return (
    <RequireWallet>
      <div class="page rz-senden rz-aufladen">
        <Show
          when={trustedMints().length > 0}
          fallback={
            <>
              <div class="rz-seitenkopf">
                <A href="/empfangen" class="rz-zurueck" aria-label="Zurück zu Empfangen">
                  ‹
                </A>
                <h2>Aufladen</h2>
              </div>
              <p class="rz-hinweis">Noch keine Ausgabestelle eingetragen.</p>
              <A href="/mint" class="rz-leise">
                Ausgabestelle wählen ›
              </A>
            </>
          }
        >
          <Show
            when={m.invoice()}
            fallback={
              <>
                <div class="rz-seitenkopf">
                  <A href="/empfangen" class="rz-zurueck" aria-label="Zurück zu Empfangen">
                    ‹
                  </A>
                  <h2>Aufladen</h2>
                </div>
                <Zaehlwerk
                  sats={ein.betrag()}
                  sofort
                  kalt={!ein.betrag() || ausserhalb()}
                  wahl={ein.wahl()}
                  onWahl={ein.kurs() ? ein.waehle : undefined}
                  euroAnzeige={ein.euroAnzeige()}
                >
                  <Show
                    when={ausserhalb()}
                    fallback={
                      <p class="rz-stelle">
                        bei <b>{ziel() ? serverOf(ziel()!.server) : ''}</b>
                        <Show when={gebuehr() > 0}>
                          {' '}· {gebuehr()} Sat{gebuehr() === 1 ? '' : 's'} Gebühr
                        </Show>{' '}
                        <Show
                          when={trustedMints().length > 1}
                          fallback={
                            <A href="/mint" class="rz-aendern">
                              ändern
                            </A>
                          }
                        >
                          <button type="button" class="rz-aendern" onClick={() => setStelle(i => i + 1)}>
                            ändern
                          </button>
                        </Show>
                      </p>
                    }
                  >
                    <div class="rz-ueber">
                      <span>
                        Möglich sind {grenzen()!.min.toLocaleString('de-DE')} bis{' '}
                        {grenzen()!.max.toLocaleString('de-DE')} Sats
                      </span>
                    </div>
                  </Show>
                </Zaehlwerk>
                <Tastatur betrag={ein} />
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  disabled={!ein.betrag() || ausserhalb() || !m.payRequest() || m.busy() || offlineMode()}
                  onClick={() => void m.rechnung()}
                >
                  <span class="lbl">{m.busy() ? 'Einen Moment …' : 'Rechnung erstellen'}</span>
                </button>
              </>
            }
          >
            {rechnung => (
              <>
                <div class="rz-seitenkopf">
                  <button type="button" class="rz-zurueck" aria-label="Zurück zur Wallet" onClick={zurueck}>
                    ‹
                  </button>
                  <h2>Aufladen</h2>
                </div>
                <div class="rz-qr">
                  <Qr value={rechnung().toUpperCase()} href={`lightning:${rechnung().toUpperCase()}`} />
                </div>
                <Zaehlwerk sats={ein.betrag()} sofort>
                  <Show when={gebuehr() > 0}>
                    <p class="rz-klein">
                      Rechnung {sats(m.aufteilung()!.grossMsat).toLocaleString('de-DE')} Sats, davon{' '}
                      {gebuehr()} Gebühr
                    </p>
                  </Show>
                </Zaehlwerk>
                <p class="rz-status">
                  <span class="rz-lampe-klein" />{' '}
                  {m.busy() ? 'Bezahlt — Schein wird abgeholt …' : 'Wartet auf Zahlung aus deiner anderen Wallet'}
                </p>
                <div class="rz-duo rz-duo-flach">
                  <button type="button" class="rz-leise" onClick={() => copyToClipboard(rechnung())}>
                    Kopieren
                  </button>
                  <Show
                    when={m.abholbar()}
                    fallback={
                      <button type="button" class="rz-leise" disabled={m.busy()} onClick={() => m.pruefen()}>
                        Jetzt nachsehen
                      </button>
                    }
                  >
                    <button type="button" class="rz-leise" disabled={m.busy()} onClick={() => m.abholen()}>
                      Bezahlt? Schein abholen
                    </button>
                  </Show>
                </div>
                <Show when={m.pruefbar()}>
                  <p class="rz-hinweis">
                    Die Wallet sieht von selbst nach, solange diese Seite offen ist. Bitte nicht schließen,
                    bis der Betrag in der Wallet steht.
                  </p>
                </Show>
              </>
            )}
          </Show>
        </Show>
      </div>
    </RequireWallet>
  )
}

export default Aufladen
