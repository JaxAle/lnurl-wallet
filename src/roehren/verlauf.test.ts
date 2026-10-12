import {describe, expect, it} from 'vitest'

import {betragAus, stelleAus, titel, trennePruefLink} from './verlauf'
import type {ActivityEvent} from '../storage'

const e = (kind: ActivityEvent['kind'], message: string): ActivityEvent => ({id: '1', kind, message, createdAt: 0})

describe('Verlauf lesen', () => {
  it('liest Betrag und Ausgabestelle aus deutschen und alten englischen Sätzen', () => {
    expect(betragAus('100 Sats aufgeladen bei lnurl.21linz.at. (1 Sat Gebühr.)')).toBe(100)
    expect(betragAus('Received 100 sats at mint@lnurl.21linz.at.')).toBe(100)
    expect(betragAus('1.250 Sats gesendet — vom Empfänger eingelöst (lnurl.21linz.at).')).toBe(1250)
    expect(betragAus('Locked a 5000 msat note at x.at to a pubkey via an addon.')).toBeNull()
    expect(stelleAus('50 Sats gesendet — vom Empfänger eingelöst (lnurl.21linz.at).')).toBe('lnurl.21linz.at')
  })
  it('nennt die Bewegung kurz', () => {
    expect(titel(e('spent', '50 Sats gesendet — vom Empfänger eingelöst.'))).toBe('Schein gesendet')
    expect(titel(e('spent', 'x.at meldet 50 Sats als schon ausgegeben – hier markiert.'))).toBe('Als ausgegeben markiert')
    expect(titel(e('refresh', 'Schein über 50 Sats zurückgeholt (x.at).'))).toBe('Zurückgeholt')
  })
  it('trennt den Prüf-Link ab, englisch wie deutsch', () => {
    expect(trennePruefLink('100 Sats aufgeladen bei a.at. Verify: https://a.at/v/1.').url).toBe('https://a.at/v/1')
    expect(trennePruefLink('50 Sats von a.at – Rechnung bezahlt. Prüfen: https://a.at/v/2.')).toEqual({
      text: '50 Sats von a.at – Rechnung bezahlt.',
      url: 'https://a.at/v/2'
    })
  })
})

describe('Prüfwache im Verlauf', () => {
  it('nennt Bestätigen und Unbekannt kurz', () => {
    expect(titel(e('refresh', 'Ungeprüften Schein über 52 Sats bestätigt (lnurl.21linz.at).'))).toBe('Bestätigt')
    expect(titel(e('refresh', 'lnurl.21linz.at kennt einen ungeprüften Schein über 52 Sats nicht — unter „Zu prüfen“.'))).toBe('Unbekannt — zu prüfen')
  })
})
