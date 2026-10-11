/* @refresh reload */
import {ErrorBoundary} from 'solid-js'
import {render} from 'solid-js/web'
import {Route, HashRouter, Navigate} from '@solidjs/router'
import toast, {Toaster} from 'solid-toast'
import {registerSW} from 'virtual:pwa-register'

import {WalletProvider} from './WalletContext'
import {DeviceProvider} from './DeviceContext'
import {notify, NotifyKind} from './helpers'
import '@fontsource/jost/300.css'
import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/jost/600.css'
import './styles/style.scss'
import './styles/background.scss'

import Nav from './components/Nav'
import Footer from './components/Footer'
import AddressAutoScanner from './components/AddressAutoScanner'
import Hero from './pages/Hero'
import Wallet from './pages/Wallet'
import Reiter from './roehren/Reiter'
import Senden from './roehren/Senden'
import Empfangen from './roehren/Empfangen'
import Setup from './pages/Setup'
import Mint from './pages/Mint'
import Activity from './pages/Activity'
import Docs from './pages/Docs'
import Vault from './pages/Vault'
import Claim from './pages/Claim'
import Settings from './pages/Settings'
import Einstellungen from './roehren/Einstellungen'
import AddonRun from './pages/AddonRun'

const root = document.getElementById('root')

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?'
  )
}

const App = (props: any) => {
  return (
    <WalletProvider>
      <DeviceProvider>
        {/* solid-toast's default top offset sits right under the viewport
        edge, which the fixed nav (taller still on mobile, see .nav-toggle in
        style.scss) then overlaps - pushed down past it instead */}
        {/* Fork: Meldungen unten statt oben rechts — oben steht das Röhren-Zählwerk, und eine
        Meldung genau darüber verdeckte das Hinaufzählen (Gerhard am Pixel, 2026-10-11); 104 px:
        über der Reiterleiste */}
        <Toaster
          position="bottom-center"
          toastOptions={{duration: 5000}}
          containerStyle={{bottom: '104px'}}
        />
        <Nav />
        {/* mounted once, wallet-wide, regardless of which page is open -
        same reasoning as WalletContext.tsx's own auto-lock ticking effect
        (this needs useWallet(), so it can't live inside WalletContext
        itself) - see the component's own top comment for what it does and
        does not cover */}
        <AddressAutoScanner />
        {/* a render-time throw (e.g. one malformed stored record) must
        never take down the whole app shell - show a recoverable error
        instead of a permanently blank page */}
        <ErrorBoundary
          fallback={(err: Error) => (
            <div class="page">
              <h2>Something went wrong</h2>
              <p>
                The last view failed to render ({err.message}). Your notes are
                still safe in storage - reload the page, and if this keeps
                happening, use Settings to export a backup.
              </p>
            </div>
          )}
        >
          {props.children}
        </ErrorBoundary>
        <Footer />
        <Reiter />
      </DeviceProvider>
    </WalletProvider>
  )
}

const cleanup = render(
  () => (
    <HashRouter root={App}>
      <Route path="/" component={Hero} />
      <Route path="/wallet" component={Wallet} />
      {/* Fork: Reiter „Scheine“ (Profi-Modus) — dieselbe Seite, nur die Liste */}
      <Route path="/scheine" component={() => <Wallet ansicht="scheine" />} />
      <Route path="/senden" component={Senden} />
      <Route path="/empfangen" component={Empfangen} />
      <Route path="/empfangen/scannen" component={() => <Empfangen weg="scannen" />} />
      <Route path="/empfangen/einfuegen" component={() => <Empfangen weg="einfuegen" />} />
      <Route path="/setup" component={Setup} />
      <Route path="/mint" component={Mint} />
      <Route path="/aufladen" component={() => <Mint aufladen />} />
      {/* /mints merged into /mint (trusted-mint management now lives at
      the bottom of that page) - kept as a redirect so old links/bookmarks
      still land somewhere useful instead of 404ing */}
      <Route path="/mints" component={() => <Navigate href="/mint" />} />
      {/* /melt merged into /wallet (MeltDialog, opened from the "Melt" hero
      button or automatically via a pasted invoice in Receive - see
      meltHandoff.ts) - kept as a redirect so old links/bookmarks still land
      somewhere useful instead of 404ing */}
      <Route path="/melt" component={() => <Navigate href="/wallet" />} />
      <Route path="/activity" component={Activity} />
      {/* /backup merged into /settings (backup/restore/forget now live
      alongside the other wallet-wide settings there) - kept as a redirect
      so old links/bookmarks still land somewhere useful instead of 404ing */}
      <Route path="/backup" component={() => <Navigate href="/settings" />} />
      <Route path="/docs" component={Docs} />
      <Route path="/settings" component={Einstellungen} />
      <Route path="/settings/erweitert" component={Settings} />
      <Route path="/addons/:addonId" component={AddonRun} />
      <Route path="/vault" component={Vault} />
      <Route path="/claim" component={Claim} />
      {/* /address merged into /mint (claiming/checking/unclaiming/auto-
      check now live in that trusted-mint card's own "@" dialog, see
      AddressDialog.tsx) - kept as a redirect so old links/bookmarks still
      land somewhere useful instead of 404ing */}
      <Route path="/address" component={() => <Navigate href="/mint" />} />
      <Route path="*" component={() => <h1>Page not found</h1>} />
    </HashRouter>
  ),
  root!
)

if (import.meta.hot) {
  import.meta.hot.dispose(cleanup)
}

// 'prompt' registerType (see vite.config.ts) means a waiting update never
// takes over on its own - the reload is only ever whatever this toast's
// button triggers, so a build never swaps out from under an in-progress
// signing/melt action
const updateSW = registerSW({
  onNeedRefresh: () => {
    const id = toast.custom(
      <span>
        Eine neue Fassung ist da.&nbsp;
        <button
          onClick={() => {
            toast.dismiss(id)
            updateSW(true)
          }}
        >
          Neu laden
        </button>
      </span>,
      {duration: Infinity}
    )
  },
  // Fork: keine Erfolgsmeldung beim ersten Start — sie sagt dem Teilnehmer nichts (Steve)
  onOfflineReady: () => {}
})
