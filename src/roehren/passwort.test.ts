import {beforeEach, describe, expect, it} from 'vitest'

const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}

const keys = await import('../keys')
const {setzePasswort, FalschesPasswort} = await import('./passwort')

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
