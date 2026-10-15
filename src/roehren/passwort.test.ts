import {beforeEach, describe, expect, it} from 'vitest'

const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}

const keys = await import('../keys')
const {setzePasswort, FalschesPasswort, passwortVergessen, FremdeWoerter} =
  await import('./passwort')

const wurzel = new Uint8Array(32).fill(7)
const bargeld = 'ab'.repeat(64)

describe('Passwort ändern und setzen', () => {
  beforeEach(() => speicher.clear())

  it('ändert: mit dem alten öffnen, mit dem neuen verschließen — derselbe Inhalt', async () => {
    await keys.saveStorageRootKey(wurzel, 'altes-passwort')
    await keys.saveCashRootKey(bargeld, 'altes-passwort')
    await setzePasswort('altes-passwort', 'neues-passwort')
    expect([
      ...(await keys.decryptSavedStorageRootKey('neues-passwort'))
    ]).toEqual([...wurzel])
    expect(await keys.decryptSavedCashRootKeyHex('neues-passwort')).toBe(
      bargeld
    )
    await expect(
      keys.decryptSavedStorageRootKey('altes-passwort')
    ).rejects.toThrow()
  })

  it('lässt bei falschem altem Passwort alles unverändert', async () => {
    await keys.saveStorageRootKey(wurzel, 'altes-passwort')
    const vorher = speicher.get('lnurlwallet_storage_root_key')
    await expect(
      setzePasswort('falsch', 'neues-passwort')
    ).rejects.toBeInstanceOf(FalschesPasswort)
    expect(speicher.get('lnurlwallet_storage_root_key')).toBe(vorher)
  })

  it('setzt ein Passwort, wo keines war', async () => {
    await keys.saveStorageRootKey(wurzel)
    await keys.saveCashRootKey(bargeld)
    expect(keys.savedStorageRootKeyIsEncrypted()).toBe(false)
    await setzePasswort(undefined, 'neues-passwort')
    expect(keys.savedStorageRootKeyIsEncrypted()).toBe(true)
    expect(keys.savedCashRootKeyIsEncrypted()).toBe(true)
    expect([
      ...(await keys.decryptSavedStorageRootKey('neues-passwort'))
    ]).toEqual([...wurzel])
  })
})

describe('Passwort vergessen (Zustand wie am iPad, 2026-10-15)', () => {
  const SEED =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  const note = (k1: string) => ({
    url: `https://lnurl.21linz.at/w?k1=${k1}`,
    amount: 100000,
    verified: true,
    callback: 'x',
    createdAt: 1,
    updatedAt: 1
  })
  const k1a = 'aa'.repeat(32)
  const k1b = 'bb'.repeat(32)

  const zustand = async () => {
    speicher.clear()
    const S = keys.deriveStorageRootKey(SEED)
    const L = keys.deriveWalletLinkingKey(SEED)
    const kS = await keys.deriveBearerAesKey(S)
    const kL = await keys.deriveBearerAesKey(L)
    const fremd = await keys.deriveBearerAesKey(new Uint8Array(32).fill(9))
    await keys.saveStorageRootKey(S, 'vergessenes-passwort') // alter Schlüssel, Passwort vergessen
    await keys.saveLinkingKey(L) // nach „Wiederherstellen“: ohne Passwort
    await keys.saveCashRootKey(
      keys.cashRootToHex(keys.deriveLud25CashRootNode(SEED))
    )
    const bestand = [
      {id: 'alt', ...(await keys.encryptRecord(kS, note(k1a)))}, // der ursprüngliche 100er
      {id: 'wiedergefunden', ...(await keys.encryptRecord(kL, note(k1a)))}, // derselbe, über „Suchen“
      {id: 'neu', ...(await keys.encryptRecord(kL, note(k1b)))}, // nach dem Wiederherstellen erhalten
      {id: 'fremd', ...(await keys.encryptRecord(fremd, note('cc'.repeat(32))))}
    ]
    speicher.set('lnurlcash_bearers', JSON.stringify(bestand))
    speicher.set(
      'lnurlcash_activity',
      JSON.stringify([
        {
          id: 'v1',
          ...(await keys.encryptRecord(kL, {
            kind: 'receive',
            message: 'x',
            createdAt: 1
          }))
        }
      ])
    )
    return {kS}
  }

  it('setzt mit den zwölf Wörtern ein neues Passwort, ein Schlüssel, Doppelte zusammengelegt, Fremdes bleibt', async () => {
    const {kS} = await zustand()
    const r = await passwortVergessen(SEED, 'neues-passwort')
    expect(r).toEqual({scheine: 2, doppelt: 1})
    expect(keys.savedKeyExists()).toBe(false)
    expect([
      ...(await keys.decryptSavedStorageRootKey('neues-passwort'))
    ]).toEqual([...keys.deriveStorageRootKey(SEED)])
    expect(keys.savedCashRootKeyIsEncrypted()).toBe(true)
    const ids = JSON.parse(speicher.get('lnurlcash_bearers')!)
      .map((x: {id: string}) => x.id)
      .sort()
    expect(ids).toEqual(['alt', 'fremd', 'neu'])
    const lesbar = await keys.decryptRecord(
      kS,
      JSON.parse(speicher.get('lnurlcash_bearers')!).find(
        (x: {id: string}) => x.id === 'neu'
      )
    )
    expect((lesbar as {url: string}).url).toContain(k1b)
    expect(
      await keys.decryptRecord(
        kS,
        JSON.parse(speicher.get('lnurlcash_activity')!)[0]
      )
    ).toMatchObject({kind: 'receive'})
  })

  it('lehnt fremde Wörter ab und ändert nichts', async () => {
    await zustand()
    const vorher = new Map(speicher)
    const andere =
      'legal winner thank year wave sausage worth useful legal winner thank yellow'
    await expect(
      passwortVergessen(andere, 'neues-passwort')
    ).rejects.toBeInstanceOf(FremdeWoerter)
    expect(new Map(speicher)).toEqual(vorher)
  })
})
