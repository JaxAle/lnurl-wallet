// Empfangen-Bildschirm → Startseite: was gescannt oder eingefügt wurde, wird hier abgelegt und von der
// Startseite mit dem Werkzeug des Originals verarbeitet (handleHeroValue: Schein, Rechnung, Adresse).
// Bewusst nicht über die Adresszeile (?…=): ein Schein IST das Geld und gehört nicht in eine URL.
import {createSignal} from 'solid-js'

const [eingang, setEingang] = createSignal<string | null>(null)
export {eingang, setEingang}
