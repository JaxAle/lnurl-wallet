// Letzte Erfahrung je Ausgabestelle beim Bezahlen (Gerhard, 2026-10-31)
import {describe, expect, it} from 'vitest'

import {erfahrung, erfahrungText, merkeAuszahlung} from './auszahlung'

describe('auszahlung', () => {
  it('ohne Erfahrung nichts', () => {
    expect(erfahrungText('neu.example')).toBeNull()
  })
  it('merkt den letzten Ausgang je Stelle', () => {
    const am = new Date(2026, 9, 31, 17, 20).getTime()
    merkeAuszahlung('minty.exe.xyz', false, am)
    merkeAuszahlung('lnurl.21linz.at', true, am)
    expect(erfahrungText('minty.exe.xyz')).toBe('zahlte zuletzt nicht (31.10.)')
    expect(erfahrungText('lnurl.21linz.at')).toBe('zuletzt bezahlt (31.10.)')
    // der jüngste Ausgang zählt
    merkeAuszahlung('minty.exe.xyz', true, am + 1000)
    expect(erfahrung('minty.exe.xyz')).toEqual({ok: true, am: am + 1000})
  })
})
