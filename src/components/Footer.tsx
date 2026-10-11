import {AiFillGithub} from 'solid-icons/ai'
import {IoLockClosedSharp, IoGlobeSharp} from 'solid-icons/io'
import {A, useLocation} from '@solidjs/router'
import {Show} from 'solid-js'

const Footer = () => {
  // Fork: nicht auf jeder Seite — auf der Startseite war sie das Hellste und sagte dem
  // Teilnehmer nichts; Version, Herkunft (dni) und Datenschutz stehen unter Einstellungen
  const ort = useLocation()
  const zeigen = () => ['/settings', '/docs'].some(p => ort.pathname.startsWith(p))
  return (
    <Show when={zeigen()}>
    <footer class="footer">
      {/* grouped as one line even on mobile (where every top-level
      .footer-item otherwise gets its own line) - version/Website/Github
      read fine together, unlike the longer privacy note below them */}
      <div class="footer-item footer-row">
        <span class="footer-row-item">LNURLwallet {__APP_VERSION__}</span>
        <a
          class="footer-row-item"
          href="https://lnurlcash.com"
          target="_blank"
          rel="noreferrer"
        >
          <IoGlobeSharp />
          &nbsp;Website
        </a>
        <a
          class="footer-row-item"
          href="https://github.com/lnurlcash/lnurl-wallet"
          target="_blank"
          rel="noreferrer"
        >
          <AiFillGithub />
          &nbsp;Github
        </a>
      </div>
      <A class="footer-item" href="/docs">
        <IoLockClosedSharp />
        &nbsp;keys never leave your browser
      </A>
    </footer>
    </Show>
  )
}
export default Footer
