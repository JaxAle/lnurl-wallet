import {describe, expect, it} from 'vitest'

import {meldung} from './meldungen'

describe('Meldungen deutsch', () => {
  it('übersetzt bekannte Meldungen und macht unklare Antworten ruhig', () => {
    expect(
      meldung(
        'This note has already been spent (service says: "Invalid or already spent k1.").'
      ).text
    ).toBe('Dieser Schein wurde schon eingelöst.')
    const unklar = meldung(
      'The split may have gone through but could not be confirmed - the possible outputs are stored unverified alongside your original note; refresh them to reconcile.'
    )
    expect(unklar.art).toBe('ruhig')
    expect(unklar.text).toMatch(/prüft gleich selbst/)
    expect(meldung('irgendwas').text).toBe('irgendwas')
  })
})
