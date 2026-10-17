import {describe, expect, it} from 'vitest'

import {satzAus, woerterProblem} from './woerter'

// gültige BIP-39-Testwörter (Testwallet im Browser, ohne Guthaben)
const W =
  'admit aware rally income whale affair indicate potato stove audit weekend tip'

describe('Zwölf Wörter aus beliebigem Text', () => {
  it('nimmt Zeilen, Nummerierung, doppelte und geschützte Leerzeichen', () => {
    const notiz = W.split(' ')
      .map((x, i) => `${i + 1}. ${x}`)
      .join('\r\n')
    expect(satzAus(notiz)).toBe(W)
    expect(woerterProblem(notiz)).toBeNull()
    expect(woerterProblem(`  ${W.replace(/ /g, '  ')}\n`)).toBeNull()
    expect(woerterProblem(W.replace('admit', 'Admit'))).toBeNull()
    expect(woerterProblem(W.replace(/ /g, '​ '))).toBeNull()
  })
  it('sagt, was nicht stimmt', () => {
    expect(woerterProblem(W.replace('rally', 'ralli'))).toMatch(/Wort 3/)
    expect(woerterProblem(W.split(' ').slice(0, 11).join(' '))).toMatch(
      /11 Wörter/
    )
    const vertauscht = W.split(' ')
    ;[vertauscht[0], vertauscht[1]] = [vertauscht[1], vertauscht[0]]
    expect(woerterProblem(vertauscht.join(' '))).toMatch(/Reihenfolge/)
  })
})
