import {describe, expect, it} from 'vitest'

import {buildGiftCardPdf} from '../addons/giftcard/pdf'
import {kartenText, TEXTE} from './geschenkkarte'

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
})
