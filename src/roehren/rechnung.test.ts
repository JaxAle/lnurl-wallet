import {describe, expect, it} from 'vitest'

import {buildNoteUrl, decodeBolt11AmountMsat, toBech32Lnurl} from '../lnurlcash'
import {
  adressText,
  istZahlziel,
  lnurlZahlziel,
  rechnungsZweck,
  saeubere
} from './rechnung'

// Testvektor aus BOLT-11 („1 cup coffee“, 250.000 Sats)
const PR =
  'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp'

describe('Rechnung lesen', () => {
  it('liest Zweck und Betrag', () => {
    expect(rechnungsZweck(PR)).toBe('1 cup coffee')
    expect(decodeBolt11AmountMsat(PR)).toBe(250_000_000)
    expect(saeubere(' lightning:' + PR.toUpperCase() + ' ')).toBe(
      PR.toUpperCase()
    )
  })
  it('liest den Text einer Lightning-Adresse', () => {
    expect(
      adressText('[["text/plain","Café Traxlmayr"],["text/identifier","x@y"]]')
    ).toBe('Café Traxlmayr')
    expect(adressText('kaputt')).toBeNull()
  })
})

// LNURL-pay als Zahlungsziel (Gerhard, 2026-10-29): was die Bezahlen-Seite ohne Abruf annimmt oder ablehnt
const PAY = 'https://stelle.example/lnurlp/spende'

describe('lnurlZahlziel', () => {
  it('entschlüsselt lnurl1 in Groß- und Kleinschreibung, auch mit lightning:', () => {
    const code = toBech32Lnurl(PAY)
    for (const t of [code, code.toLowerCase(), `lightning:${code}`])
      expect(lnurlZahlziel(t)).toEqual({url: PAY, stelle: 'stelle.example'})
  })

  it('liest lnurlp:// (LUD-17) als https', () => {
    expect(lnurlZahlziel('lnurlp://stelle.example/lnurlp/spende')).toEqual({
      url: PAY,
      stelle: 'stelle.example'
    })
  })

  it('lehnt Abhebe- und Anmelde-Codes ab, ohne sie abzurufen', () => {
    for (const t of [
      'lnurlw://stelle.example/withdraw',
      'keyauth://stelle.example/login'
    ])
      expect(lnurlZahlziel(t)).toHaveProperty('fehler')
  })

  it('lehnt einen Schein ab (Abhebe-Link mit k1), auch als lnurl1', () => {
    const schein = buildNoteUrl(
      'https://stelle.example/lnurlw/x',
      'a'.repeat(64),
      1000
    )
    expect(lnurlZahlziel(toBech32Lnurl(schein))).toEqual({
      fehler: 'Das ist ein Schein — einlösen unter Empfangen, nicht bezahlen.'
    })
  })

  it('lehnt kaputte Codes und Klartext-http ins Netz ab', () => {
    const code = toBech32Lnurl(PAY)
    expect(lnurlZahlziel(code.slice(0, -1) + 'Q')).toEqual({
      fehler: 'Dieser LNURL-Code ist nicht lesbar.'
    })
    expect(
      lnurlZahlziel(toBech32Lnurl('http://stelle.example/lnurlp/x'))
    ).toHaveProperty('fehler')
  })

  it('lässt Rechnung und Adresse unberührt (null)', () => {
    expect(lnurlZahlziel(PR)).toBeNull()
    expect(lnurlZahlziel('name@stelle.example')).toBeNull()
  })
})

describe('istZahlziel', () => {
  it('nimmt Rechnung, Adresse und LNURL-pay', () => {
    expect(istZahlziel(PR)).toBe(true)
    expect(istZahlziel('name@stelle.example')).toBe(true)
    expect(istZahlziel(toBech32Lnurl(PAY))).toBe(true)
  })

  it('nimmt keinen Abhebe-Code und keinen Unsinn', () => {
    expect(istZahlziel('lnurlw://stelle.example/withdraw')).toBe(false)
    expect(istZahlziel('https://example.com')).toBe(false)
    expect(istZahlziel('LNURL1QQQ')).toBe(false)
  })
})
