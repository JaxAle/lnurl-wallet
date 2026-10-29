// Bezahlen: welche Ausgabestellen den Betrag decken können (Gerhard, 2026-10-29)
import {describe, expect, it} from 'vitest'

import type {Bearer} from '../storage'
import {scheineJeStelle} from './abspalten'

const s = (id: string, host: string, sats: number): Bearer => ({
  id,
  url: `https://${host}/lnurlw/x?k1=${id}`,
  callback: '',
  amount: sats * 1000,
  verified: true,
  createdAt: 0,
  updatedAt: 0
})

describe('scheineJeStelle', () => {
  const scheine = [
    s('a', 'mint.600.wtf', 500),
    s('b', 'mint.600.wtf', 60),
    s('c', 'lnurl.21linz.at', 25),
    s('d', 'minty.exe.xyz', 49)
  ]

  it('genau passender Schein vorn, dann je Stelle der kleinste größere', () => {
    expect(scheineJeStelle(scheine, 25_000).map(b => b.id)).toEqual([
      'c',
      'b',
      'd'
    ])
  })

  it('eine Stelle, die den Betrag nicht deckt, fehlt', () => {
    expect(scheineJeStelle(scheine, 60_000).map(b => b.id)).toEqual(['b'])
    expect(scheineJeStelle(scheine, 100_000).map(b => b.id)).toEqual(['a'])
  })

  it('niemand deckt den Betrag → leer', () => {
    expect(scheineJeStelle(scheine, 600_000)).toEqual([])
  })
})
