import {describe, expect, it} from 'vitest'

import {decodeBolt11AmountMsat} from '../lnurlcash'
import {adressText, rechnungsZweck, saeubere} from './rechnung'

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
