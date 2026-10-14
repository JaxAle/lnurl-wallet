import {describe, expect, it} from 'vitest'

import {resolveNoteInput, toBech32Lnurl} from '../lnurlcash'
import {ausText, linkText} from './weitergabe'
import type {Bearer} from '../storage'

const url =
  'https://lnurl.21linz.at/.well-known/lnurlw/mint?k1=' +
  'ab'.repeat(32) +
  '&amount=50000'
const schein = {id: 'x', url, amount: 50000} as Bearer

describe('Weitergeben als Link', () => {
  it('der geteilte Text enthält den Schein, und Einfügen findet ihn darin', () => {
    const text = linkText(schein)
    expect(text).toContain('50 Sats für dich')
    expect(text).toContain('lightning:' + toBech32Lnurl(url))
    expect(resolveNoteInput(ausText(text))).toBeTruthy()
  })
  it('lässt reine Eingaben unverändert', () => {
    const b = toBech32Lnurl(url)
    expect(ausText(b)).toBe(b)
    expect(ausText('  lnbc1500n1pjtest ')).toBe('lnbc1500n1pjtest')
  })
})
