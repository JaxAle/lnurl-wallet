// „So funktioniert die Wallet“ — eine deutsche Seite wie ein Begleitheft, statt der technischen Startseite
// des Originals und der englischen Anleitung (Steve, 2026-10-15). Für Menschen, nicht für Entwickler; die
// technische Beschreibung bleibt beim Original auf GitHub.
import type {Component, JSX} from 'solid-js'
import {A} from '@solidjs/router'

import './roehren.css'

const Abschnitt: Component<{titel: string; children: JSX.Element}> = props => (
  <section class="rz-gruppe rz-heft">
    <h3>{props.titel}</h3>
    {props.children}
  </section>
)

const SoFunktioniert: Component = () => (
  <div class="page rz-einstellungen">
    <div class="rz-seitenkopf">
      <A
        href="/settings"
        class="rz-zurueck"
        aria-label="Zurück zu den Einstellungen"
      >
        ‹
      </A>
      <h2>So funktioniert die Wallet</h2>
    </div>

    <Abschnitt titel="Ein Schein ist Geld">
      <p>
        Die Wallet hält dein Geld in <b>Scheinen</b>, wie Banknoten: 50 Sats,
        100 Sats, 1.000 Sats. Wer einen Schein hat, dem gehört er. Einen Schein
        weitergeben heißt, das Geld weitergeben — als QR-Code zum Scannen oder
        als Link in einer Nachricht.
      </p>
    </Abschnitt>

    <Abschnitt titel="Die Ausgabestelle verwahrt die Sats">
      <p>
        Hinter jedem Schein stehen echte Sats bei einer <b>Ausgabestelle</b>,
        zum Beispiel lnurl.21linz.at vom Bitcoin Club Linz. Sie gibt die Scheine
        aus, wenn du auflädst, und löst sie ein, wenn jemand sie einlöst. Du
        vertraust ihr wie einer Wechselstube: Verteile größere Beträge ruhig auf
        mehrere.
      </p>
    </Abschnitt>

    <Abschnitt titel="Senden, Empfangen, Zurückholen">
      <p>
        <b>Senden:</b> Die Wallet trennt den Betrag als eigenen Schein ab und
        zeigt ihn als QR-Code oder schickt ihn als Link. Solange der Empfänger
        nicht eingelöst hat, steht er unter „Unterwegs“ — und du kannst ihn
        zurückholen. Dann ist der gezeigte Code wertlos.
      </p>
      <p>
        <b>Empfangen:</b> Scannen oder einfügen. Die Wallet löst den Schein
        sofort ein und bekommt dafür einen neuen — so hat der Absender keine
        Kopie mehr.
      </p>
      <p>
        <b>Teilen und Zusammenlegen</b> wechselt Scheine wie an der Kassa: aus
        100 werden 50 + 50, aus zwei 52ern ein 104er. Das geht nur innerhalb
        einer Ausgabestelle.
      </p>
    </Abschnitt>

    <Abschnitt titel="Nur auf diesem Gerät">
      <p>
        Es gibt kein Konto und keinen Server der Wallet. Deine Scheine liegen
        verschlüsselt in diesem Browser. Das
        <b> Passwort</b> schützt sie auf diesem Gerät.
      </p>
    </Abschnitt>

    <Abschnitt titel="Zwölf Wörter und Sicherung — zwei verschiedene Dinge">
      <p>
        Die <b>zwölf Wörter</b> sind dein Schlüssel. Mit ihnen stellst du die
        Wallet auf einem neuen Gerät wieder her und findest die meisten deiner
        Scheine bei ihren Ausgabestellen wieder.
      </p>
      <p>
        Die <b>Sicherung</b> ist eine Datei mit allen Scheinen. Sie hilft, wenn
        das Handy verloren geht. Gegen Diebstahl eines einzelnen Scheins hilft
        sie nicht: Wer ihn zuerst einlöst, bekommt das Geld. Lade nach jeder
        größeren Änderung eine neue herunter.
      </p>
    </Abschnitt>

    <Abschnitt titel="Wenn eine Antwort ausbleibt">
      <p>
        Bricht das Netz mitten im Teilen, Zusammenlegen oder Empfangen ab, weiß
        die Wallet kurz nicht, was gilt. Sie hält den Vorgang dann fest, sperrt
        die beteiligten Scheine und klärt ihn selbst, sobald die Ausgabestelle
        wieder antwortet. Geld geht dabei nicht verloren.
      </p>
    </Abschnitt>

    <p class="rz-fuss">
      Die Wallet ist ein Fork der LNURLwallet von dni (LNURLcash, LUD-25).
      <br />
      <a
        href="https://github.com/lnurlcash/lnurl-wallet"
        target="_blank"
        rel="noreferrer"
      >
        Technische Beschreibung (englisch, GitHub) ›
      </a>
    </p>
  </div>
)

export default SoFunktioniert
