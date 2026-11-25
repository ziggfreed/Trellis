import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SecretStore, type Encryptor } from './secret-store'

/** A stand-in for safeStorage: reverses the text so it isn't stored as-is. */
function fakeEncryptor(available = true): Encryptor {
  return {
    isAvailable: async () => available,
    isWeak: () => false,
    encrypt: async (text) => Buffer.from([...text].reverse().join('')),
    decrypt: async (buffer) => [...buffer.toString()].reverse().join(''),
  }
}

const tempDir = () => mkdtempSync(join(tmpdir(), 'trellis-secrets-'))

describe('SecretStore', () => {
  it('stores values encrypted and reads them back', async () => {
    const dir = tempDir()
    const store = new SecretStore(dir, fakeEncryptor())
    await store.set('ai.apiKey', 'sk-secret')
    expect(await store.get('ai.apiKey')).toBe('sk-secret')
    expect(store.has('ai.apiKey')).toBe(true)
    expect(readFileSync(join(dir, 'secrets.json'), 'utf8')).not.toContain('sk-secret')
    // A new store (next app start) reads the file.
    expect(await new SecretStore(dir, fakeEncryptor()).get('ai.apiKey')).toBe('sk-secret')
  })

  it('keeps every value when set is called quickly in a row', async () => {
    const store = new SecretStore(tempDir(), fakeEncryptor())
    await Promise.all([store.set('a', '1'), store.set('b', '2'), store.set('c', '3')])
    expect([await store.get('a'), await store.get('b'), await store.get('c')]).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('deletes single keys and whole prefixes', async () => {
    const store = new SecretStore(tempDir(), fakeEncryptor())
    await store.set('plugin:a:token', '1')
    await store.set('plugin:a:other', '2')
    await store.set('plugin:b:token', '3')
    await store.delete('plugin:a:other')
    expect(await store.get('plugin:a:other')).toBeUndefined()
    await store.deletePrefix('plugin:a:')
    expect(store.has('plugin:a:token')).toBe(false)
    expect(await store.get('plugin:b:token')).toBe('3')
  })

  it('refuses to store when the system has no secure storage', async () => {
    const store = new SecretStore(tempDir(), fakeEncryptor(false))
    await expect(store.set('k', 'v')).rejects.toThrow(/secure storage/)
  })
})
