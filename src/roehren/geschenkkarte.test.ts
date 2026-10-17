import {describe, expect, it} from 'vitest'

import {buildGiftCardPdf} from '../addons/giftcard/pdf'
import {euroNotiz, kartenText, TEXTE, vorschlag} from './geschenkkarte'

describe('Geschenkkarte', () => {
  it('ersetzt Zeichen, die die PDF-Schrift nicht kennt', () => {
    expect(kartenText('„Frohe Weihnachten“ — für dich 🎄…')).toBe(
      '"Frohe Weihnachten" - für dich ...'
    )
  })
  it('baut die Karte mit deutschen Texten', async () => {
    const pdf = await buildGiftCardPdf(
      kartenText('Viel Freude mit deinen Sats! Grüße aus Linz 🎁'),
      1000,
      'festive',
      'https://lnurl.21linz.at/w?k1=' + 'ab'.repeat(32),
      TEXTE
    )
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(1000)
  })
  it('nennt den Euro-Wert mit Datum und schlägt im Dezember Weihnachten vor', () => {
    const tag = new Date(2026, 11, 5)
    expect(euroNotiz(100, 70_000, tag)).toBe('ca. 0,07 € am 5.12.2026')
    expect(euroNotiz(100, null, tag)).toBeUndefined()
    expect(vorschlag(tag).nachricht).toBe('Frohe Weihnachten!')
    expect(vorschlag(new Date(2026, 9, 17)).motiv).toBe('classic')
  })
})
