import type {Component} from 'solid-js'
import UnterwegsListe from '../roehren/UnterwegsListe'
import VerlaufListe from '../roehren/VerlaufListe'
import {Show, createSignal} from 'solid-js'
import {
  IoRefreshSharp,
  IoCheckmarkCircleSharp,
  IoCopySharp
} from 'solid-icons/io'

import {useWallet} from '../WalletContext'
import {
  fetchInvoiceVerification,
  verifyMeltPreimage,
  type VerifyResult
} from '../lnurlcash'
import {copyToClipboard} from '../helpers'
import RequireWallet from '../components/RequireWallet'
import Dialog from '../components/Dialog'

const Activity: Component = () => {
  const {activity} = useWallet()

  // the dialog's own state - null url means closed. Checking is a settled
  // LUD-21 verify response already carries everything needed (the invoice
  // itself, settled, and an optional preimage), so there's nothing to fetch
  // beyond that one request - no separate "fetch the invoice" round trip
  const [verifyDialogUrl, setVerifyDialogUrl] = createSignal<string | null>(
    null
  )
  const [verifying, setVerifying] = createSignal(false)
  const [verifyResult, setVerifyResult] = createSignal<VerifyResult | null>(
    null
  )
  const [verifyError, setVerifyError] = createSignal<string | null>(null)

  const openVerify = async (url: string) => {
    setVerifyDialogUrl(url)
    setVerifyResult(null)
    setVerifyError(null)
    setVerifying(true)
    try {
      setVerifyResult(await fetchInvoiceVerification(url))
    } catch (err) {
      setVerifyError((err as Error).message)
    } finally {
      setVerifying(false)
    }
  }

  const closeVerify = () => {
    setVerifyDialogUrl(null)
    setVerifyResult(null)
    setVerifyError(null)
  }

  return (
    <RequireWallet>
      <div id="activity" class="page">
        {/* Fork: Titel wie die anderen Reiter, ohne Zurück (Verlauf ist ein Reiter) und ohne
            Papierkorb — Löschen liegt unter Einstellungen › Erweitert (Steve, 2026-10-11) */}
        <h2 class="rz-titel">Verlauf</h2>
        {/* Fork: was unterwegs ist, steht oben im Verlauf (Prototyp: „Offen“) */}
        <UnterwegsListe />
        <Show
          when={activity().length > 0}
          fallback={
            <p class="rz-hinweis">
              Noch nichts geschehen – Aufladen, Teilen, Zusammenlegen, Bezahlen und Umziehen erscheinen hier.
            </p>
          }
        >
          <VerlaufListe eintraege={activity()} onPruefen={url => void openVerify(url)} />
        </Show>
      </div>
      <Show when={verifyDialogUrl()}>
        <Dialog onClose={closeVerify}>
          <h4>Zahlung prüfen</h4>
          <Show when={verifying()}>
            <p>
              <IoRefreshSharp class="spin" />
              &nbsp;Wird geprüft …
            </p>
          </Show>
          <Show when={verifyError()}>
            {err => <p class="warning">{err()}</p>}
          </Show>
          <Show when={verifyResult()}>
            {result => (
              <>
                <p>
                  {result().settled
                    ? 'Settled - the service reports this payment went through.'
                    : 'Not settled yet.'}
                </p>
                <label>Rechnung</label>
                <p class="mint-pubkey">{result().pr}</p>
                <div class="btns">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result().pr)}
                  >
                    <IoCopySharp />
                    &nbsp;Rechnung kopieren
                  </button>
                </div>
                <Show when={result().settled}>
                  <Show
                    when={result().preimage}
                    fallback={
                      <p class="warning">
                        Bezahlt, aber die Ausgabestelle hat kein Preimage genannt – das ist nur ihre eigene Angabe, nicht unabhängig prüfbar.
                      </p>
                    }
                  >
                    {preimage => (
                      <Show
                        when={verifyMeltPreimage(result().pr, preimage())}
                        fallback={
                          <p class="warning">
                            Das genannte Preimage passt NICHT zum Zahlungs-Hash dieser Rechnung – das ist kein gültiger Zahlungsbeleg.
                          </p>
                        }
                      >
                        <p>
                          <IoCheckmarkCircleSharp />
                          &nbsp;Preimage geprüft – es passt genau zum Zahlungs-Hash dieser Rechnung.
                        </p>
                      </Show>
                    )}
                  </Show>
                </Show>
              </>
            )}
          </Show>
        </Dialog>
      </Show>
    </RequireWallet>
  )
}
export default Activity
