// Oben in den Einstellungen: was im Original im Menü oben links lag (Prototyp: kein Menü — Seltenes
// wohnt in den Einstellungen). Ausgabestellen, eingeschaltete Extras, Anleitung und Herkunft.
import type {Component} from 'solid-js'
import {For, Show} from 'solid-js'
import {A} from '@solidjs/router'

import {allAddons} from '../addons/registry'
import {enabledAddonIds} from '../addons/enabled'
import {trustedMints} from '../trustedMints'
import {vaultEnabled} from '../vaultFeature'


// Bauzeit in Ortszeit, z. B. „11.10.2026, 21:40“ — daran erkennt man am Gerät, ob „Neu laden“ gegriffen hat
const FASSUNG = new Date(__BAU_ZEIT__).toLocaleString('de-AT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})
const host = (origin: string): string => {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

const EinstellungenOben: Component = () => {
  // Extras mit eigener Seite — im Original standen sie als Eintrag im Menü
  const extras = () =>
    allAddons().filter(a => enabledAddonIds().has(a.manifest.id) && a.manifest.nav)

  return (
    <div class="rz-einstellungen-oben">
      <div class="setup-card">
        <h4>Ausgabestellen</h4>
        <p>
          <Show when={trustedMints().length > 0} fallback="Noch keine Ausgabestelle eingetragen.">
            {trustedMints()
              .map(m => host(m.server))
              .join(' · ')}
          </Show>
        </p>
        <div class="btns">
          <A href="/mint" class="link-btn">
            Ausgabestellen verwalten ›
          </A>
        </div>
      </div>

      <Show when={extras().length > 0 || vaultEnabled()}>
        <div class="setup-card">
          <h4>Extras</h4>
          <div class="btns">
            <For each={extras()}>
              {addon => (
                <A
                  href={addon.manifest.nav!.route ?? `/addons/${addon.manifest.id}`}
                  class="link-btn"
                >
                  {addon.manifest.nav!.label} ›
                </A>
              )}
            </For>
            <Show when={vaultEnabled()}>
              <A href="/vault" class="link-btn">
                Vault ›
              </A>
            </Show>
          </div>
        </div>
      </Show>

      <div class="setup-card">
        <h4>Über diese Wallet</h4>
        <p>
          Die LNURLwallet von dni mit eigener Oberfläche — ein Fork (JaxAle/lnurl-wallet). Die
          Schlüssel verlassen diesen Browser nie.
        </p>
        <p class="rz-fassung">
          Fassung vom {FASSUNG} <span class="rz-matt">· {__APP_VERSION__}</span>
        </p>
        <div class="btns">
          <A href="/docs" class="link-btn">
            Anleitung ›
          </A>
          <a class="link-btn" href="https://github.com/lnurlcash/lnurl-wallet" target="_blank" rel="noreferrer">
            Original auf GitHub ›
          </a>
        </div>
      </div>
    </div>
  )
}

export default EinstellungenOben
