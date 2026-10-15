// Scheine wiederfinden — ohne Wahl (Gerhard am iPad, 2026-10-15: bewusst die falsche Stelle gewählt, nichts
// gefunden). Nach dem Wiederherstellen sucht die Wallet von selbst bei allen bekannten Ausgabestellen: den
// eigenen (Liste/Sicherung) und den öffentlichen, lnurl.21linz.at zuerst. Eine Zeile je Stelle, am Ende ein
// Satz. Die Suche selbst ist scanMintForNotes des Originals (recovery.ts), unverändert — je Stelle so viele
// Nachfragen, bis die eingestellte Suchtiefe hintereinander nichts mehr findet.
import type {Component} from 'solid-js'
import {createSignal, For, onMount, Show} from 'solid-js'

import {
  mergeCashAddressSecretIndices,
  mergeCashChangeSecretIndices
} from '../cashSecrets'
import {resolveMintInput, serverOf} from '../lnurlcash'
import {scanMintForNotes} from '../recovery'
import {
  getTrustedMintAddress,
  PUBLIC_MINTS,
  trustedMints
} from '../trustedMints'
import {useWallet} from '../WalletContext'
import './roehren.css'

type Zeile = {
  adresse: string
  host: string
  stand: 'wartet' | 'sucht' | 'fertig' | 'fehler'
  scheine: number
  sats: number
}

const VORNE = 'lnurl.21linz.at'

// alle bekannten Stellen, je Host einmal: eigene zuerst (wie zuletzt erreicht), dann die öffentlichen
export const kandidaten = (): {adresse: string; host: string}[] => {
  const liste: {adresse: string; host: string}[] = []
  const dazu = (adresse: string) => {
    const url = resolveMintInput(adresse)
    if (!url) return
    const host = serverOf(url)
    if (!liste.some(x => x.host === host)) liste.push({adresse, host})
  }
  for (const t of trustedMints())
    dazu(getTrustedMintAddress(t.server) || `mint@${serverOf(t.server)}`)
  for (const a of PUBLIC_MINTS) dazu(a)
  return liste.sort(
    (a, b) => Number(b.host === VORNE) - Number(a.host === VORNE)
  )
}

const Wiederfinden: Component<{
  onFertig: () => void
  automatisch?: boolean
  nur?: string
}> = props => {
  const {bearers, addBearer, logActivity} = useWallet()
  const start = props.nur
    ? kandidaten().filter(k => k.host === props.nur)
    : kandidaten()
  const [zeilen, setZeilen] = createSignal<Zeile[]>(
    start.map(k => ({...k, stand: 'wartet', scheine: 0, sats: 0}))
  )
  const [laeuft, setLaeuft] = createSignal(false)
  const [fertig, setFertig] = createSignal(false)
  const [eigene, setEigene] = createSignal('')

  const setze = (host: string, z: Partial<Zeile>) =>
    setZeilen(zs => zs.map(x => (x.host === host ? {...x, ...z} : x)))

  const suche = async (welche: Zeile[]) => {
    setLaeuft(true)
    try {
      for (const z of welche) {
        setze(z.host, {stand: 'sucht'})
        const r = await scanMintForNotes(z.adresse, undefined, bearers())
        for (const note of r.recovered) {
          await addBearer(note)
          logActivity(
            'recovered',
            `${Math.floor(note.amount / 1000)} Sats von ${r.server} beim Wiederherstellen gefunden.`
          )
        }
        if (r.highestUsedIndex !== null)
          mergeCashAddressSecretIndices({[r.server]: r.highestUsedIndex + 1})
        if (r.highestUsedChangeIndex !== null)
          mergeCashChangeSecretIndices({
            [r.server]: r.highestUsedChangeIndex + 1
          })
        setze(z.host, {
          stand: r.error ? 'fehler' : 'fertig',
          scheine: r.recovered.length,
          sats: r.recovered.reduce((a, n) => a + Math.floor(n.amount / 1000), 0)
        })
      }
    } finally {
      setLaeuft(false)
      setFertig(true)
    }
  }

  const eigeneDazu = () => {
    const a = eigene().trim()
    const url = resolveMintInput(a)
    if (!url) return
    const host = serverOf(url)
    if (!zeilen().some(z => z.host === host)) {
      const z: Zeile = {adresse: a, host, stand: 'wartet', scheine: 0, sats: 0}
      setZeilen(zs => [...zs, z])
      setEigene('')
      void suche([z])
    }
  }

  onMount(() => {
    if (props.automatisch !== false) void suche(zeilen())
  })

  const gefunden = () => zeilen().filter(z => z.scheine > 0)
  const summe = () => gefunden().reduce((a, z) => a + z.sats, 0)
  const anzahl = () => gefunden().reduce((a, z) => a + z.scheine, 0)

  return (
    <div class="rz-wiederfinden">
      <p class="rz-hinweis">
        Die Wallet fragt bei jeder bekannten Ausgabestelle nach Scheinen, die zu
        deinen zwölf Wörtern gehören. Das dauert etwas — bitte offen lassen.
      </p>
      <div class="rz-liste">
        <For each={zeilen()}>
          {z => (
            <div class="rz-setting rz-still">
              <span>
                <span class="sl">{z.host}</span>
              </span>
              <span class="val">
                {z.stand === 'wartet'
                  ? '…'
                  : z.stand === 'sucht'
                    ? 'sucht …'
                    : z.stand === 'fehler'
                      ? 'nicht erreichbar'
                      : z.scheine > 0
                        ? `${z.scheine} ${z.scheine === 1 ? 'Schein' : 'Scheine'}, ${z.sats.toLocaleString('de-DE')} Sats`
                        : 'nichts'}
              </span>
            </div>
          )}
        </For>
      </div>

      <Show when={fertig() && !laeuft()}>
        <div class="rz-frage">
          <h3>
            {anzahl() > 0
              ? `Gefunden: ${anzahl()} ${anzahl() === 1 ? 'Schein' : 'Scheine'}, ${summe().toLocaleString('de-DE')} Sats`
              : 'Keine Scheine gefunden'}
          </h3>
          <Show when={anzahl() === 0}>
            <p class="rz-hinweis">
              Gefunden werden Scheine, die diese Wallet selbst erzeugt, geteilt
              oder zusammengelegt hat. Empfangene und sehr alte Scheine stecken
              nur in einer Sicherungsdatei.
            </p>
          </Show>
          <Show when={zeilen().some(z => z.stand === 'fehler')}>
            <p class="rz-hinweis">
              Nicht erreichbare Stellen kannst du später unter Einstellungen ›
              Ausgabestellen erneut durchsuchen.
            </p>
          </Show>
        </div>
      </Show>

      <details class="rz-erweitert">
        <summary>Bei einer anderen Stelle suchen</summary>
        <input
          class="rz-feld"
          type="text"
          autocapitalize="off"
          spellcheck={false}
          placeholder="z. B. mint@stelle.beispiel.at"
          value={eigene()}
          onInput={e => setEigene(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && eigeneDazu()}
        />
        <button
          type="button"
          class="rz-leise rz-block"
          disabled={laeuft() || !resolveMintInput(eigene().trim())}
          onClick={eigeneDazu}
        >
          Dort suchen ›
        </button>
      </details>

      <button
        type="button"
        class="rz-knopf an rz-weiter"
        disabled={laeuft()}
        onClick={() => props.onFertig()}
      >
        <span class="lbl">{laeuft() ? 'Sucht …' : 'Zur Wallet'}</span>
      </button>
    </div>
  )
}

export default Wiederfinden
