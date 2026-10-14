import {describe, expect, it} from 'vitest'

import {resolveNoteInput, toBech32Lnurl} from '../lnurlcash'
import {ausText, betreff, nurLink} from './weitergabe'
import type {Bearer} from '../storage'

const url =
  'https://lnurl.21linz.at/.well-known/lnurlw/mint?k1=' +
  'ab'.repeat(32) +
  '&amount=50000'
const schein = {id: 'x', url, amount: 50000} as Bearer

describe('Weitergeben als Link', () => {
  it('schickt nur den reinen Link — den liest auch die Original-Wallet', () => {
    expect(nurLink(schein)).toBe('lightning:' + toBech32Lnurl(url))
    expect(resolveNoteInput(nurLink(schein))).toBeTruthy()
    expect(betreff(schein)).toBe(
      '50 Sats für dich (LNURLcash-Schein von lnurl.21linz.at)'
    )
  })
  it('findet den Schein auch in einer ganzen Nachricht', () => {
    expect(
      resolveNoteInput(ausText('Für dich: ' + nurLink(schein) + ' Danke!'))
    ).toBeTruthy()
  })
  it('findet den Schein auch mit unsichtbaren Trennzeichen eines Messengers', () => {
    const b = toBech32Lnurl(url)
    const zerstueckelt =
      b.slice(0, 40) + '\u200b' + b.slice(40, 80) + '\u00ad' + b.slice(80)
    expect(
      resolveNoteInput(ausText('Für dich: lightning:' + zerstueckelt))
    ).toBeTruthy()
  })
  it('lässt reine Eingaben unverändert', () => {
    const b = toBech32Lnurl(url)
    expect(ausText(b)).toBe(b)
    expect(ausText('  lnbc1500n1pjtest ')).toBe('lnbc1500n1pjtest')
  })
})
