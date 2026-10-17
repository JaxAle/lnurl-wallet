// Motive der Geschenkkarte nach Anlass (Steve, 2026-10-17): fünf Farben waren ein Motiv in fünf Farben.
// Jetzt erzählt jedes einen Anlass, mit einer Zeichnung in dünnem Draht wie die Röhren — als
// Vektorlinien in einem 100×100-Feld (y nach unten, wie SVG), dieselben Linien fürs PDF
// (addons/giftcard/pdf.ts › drawSvgPath) und für die Vorschau am Bildschirm.

export type Rgb = [number, number, number]
export type MotivId =
  'klassisch' | 'weihnachten' | 'geburtstag' | 'danke' | 'schlicht'

export type Motiv = {
  id: MotivId
  name: string
  nachricht: string // Vorschlag, solange man nicht selbst schreibt
  bg: Rgb
  accent: Rgb // Leiste und Titel
  text: Rgb
  zeichnung: string[] // Linienzüge im 100×100-Feld; leer = keine Zeichnung
  draht: Rgb // Farbe der Zeichnung
}

// Sats-Zeichen in der Röhre, um 13,88° geneigt wie neben dem Zählwerk
const ROEHRE = [
  'M32 8 H68 Q80 8 80 20 V80 Q80 90 68 90 H32 Q20 90 20 80 V20 Q20 8 32 8 Z',
  'M40 90 V97 M50 90 V97 M60 90 V97',
  'M55 24 L45 76',
  'M37 37 L63 43.5 M35.5 48 L61.5 54.5 M34 59 L60 65.5'
]
const BAUM = [
  'M50 4 L52.6 11.5 L60.5 11.6 L54.2 16.3 L56.5 23.9 L50 19.4 L43.5 23.9 L45.8 16.3 L39.5 11.6 L47.4 11.5 Z',
  'M50 28 L36 46 H44 L28 66 H40 L22 86 H78 L60 66 H72 L56 46 H64 Z',
  'M46 86 V95 H54 V86',
  'M39 52 Q50 58 61 51 M33 74 Q50 82 67 72',
  'M41 54.6 a1.6 1.6 0 1 0 0.1 0 M50 56.4 a1.6 1.6 0 1 0 0.1 0 M59 52.6 a1.6 1.6 0 1 0 0.1 0',
  'M37 75.6 a1.6 1.6 0 1 0 0.1 0 M50 78.4 a1.6 1.6 0 1 0 0.1 0 M63 74.6 a1.6 1.6 0 1 0 0.1 0'
]
const KUCHEN = [
  'M20 58 H80 V88 H20 Z',
  'M20 70 Q30 77 40 70 Q50 63 60 70 Q70 77 80 70',
  'M12 92 H88',
  'M35 58 V42 M50 58 V38 M65 58 V42',
  'M35 37 Q31 31 35 25 Q39 31 35 37 Z M50 33 Q46 27 50 21 Q54 27 50 33 Z M65 37 Q61 31 65 25 Q69 31 65 37 Z'
]
const HERZ = [
  'M50 88 C22 68 10 50 20 35 C29 22 45 25 50 37 C55 25 71 22 80 35 C90 50 78 68 50 88 Z',
  'M50 20 V8 M31 24 L24 14 M69 24 L76 14'
]

export const MOTIVE: Motiv[] = [
  {
    id: 'klassisch',
    name: 'Klassisch',
    nachricht: 'Viel Freude mit deinen Sats!',
    bg: [0.06, 0.05, 0.04],
    accent: [1, 0.62, 0.25],
    text: [0.95, 0.95, 0.95],
    zeichnung: ROEHRE,
    draht: [1, 0.7, 0.35]
  },
  {
    id: 'weihnachten',
    name: 'Weihnachten',
    nachricht: 'Frohe Weihnachten!',
    bg: [0.02, 0.08, 0.05],
    accent: [0.85, 0.18, 0.16],
    text: [0.95, 0.95, 0.95],
    zeichnung: BAUM,
    draht: [1, 0.78, 0.35]
  },
  {
    id: 'geburtstag',
    name: 'Geburtstag',
    nachricht: 'Alles Gute zum Geburtstag!',
    bg: [0.08, 0.02, 0.13],
    accent: [0.85, 0.66, 0.16],
    text: [0.95, 0.95, 0.95],
    zeichnung: KUCHEN,
    draht: [0.95, 0.75, 0.3]
  },
  {
    id: 'danke',
    name: 'Danke',
    nachricht: 'Danke!',
    bg: [0.07, 0.04, 0.05],
    accent: [0.95, 0.45, 0.5],
    text: [0.95, 0.95, 0.95],
    zeichnung: HERZ,
    draht: [0.98, 0.55, 0.58]
  },
  {
    id: 'schlicht',
    name: 'Schlicht',
    nachricht: 'Für dich.',
    bg: [1, 1, 1],
    accent: [0.1, 0.1, 0.1],
    text: [0.1, 0.1, 0.1],
    zeichnung: [],
    draht: [0.1, 0.1, 0.1]
  }
]

export const motiv = (id: MotivId): Motiv =>
  MOTIVE.find(m => m.id === id) ?? MOTIVE[0]

export const css = (c: Rgb) =>
  `rgb(${c.map(x => Math.round(x * 255)).join(',')})`
