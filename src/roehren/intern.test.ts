import {describe, expect, it} from 'vitest'

import type {Bearer} from '../storage'
import {scheineBei, waehleIntern} from './intern'

const schein = (id: string, sats: number, stelle = 'a.at'): Bearer =>
  ({
    id,
    url: `https://${stelle}/n?k1=${id}`,
    callback: `https://${stelle}/cb`,
    amount: sats * 1000,
    verified: true
  }) as Bearer

describe('Interne Überweisung — Auswahl', () => {
  const s = [schein('1', 100), schein('2', 50), schein('3', 30)]
  it('nimmt einen Schein über genau den Betrag', () => {
    expect(waehleIntern(s, 50_000).map(b => b.id)).toEqual(['2'])
  })
  it('nimmt alle, wenn sie genau reichen', () => {
    expect(waehleIntern(s, 180_000)).toHaveLength(3)
  })
  it('sammelt der Reihe nach, bis es reicht', () => {
    expect(waehleIntern(s, 120_000).map(b => b.id)).toEqual(['1', '2'])
  })
  it('gibt nichts, wenn es nicht reicht', () => {
    expect(waehleIntern(s, 200_000)).toEqual([])
  })
  it('nur Scheine bei der Stelle des Empfängers, nicht aus dem Tresor', () => {
    const t = {...schein('4', 10), deviceId: 'd'} as Bearer
    const b = scheineBei(
      [...s, schein('5', 10, 'b.at'), t],
      'https://a.at/lnurlp/x'
    )
    expect(b.map(x => x.id)).toEqual(['1', '2', '3'])
  })
})
