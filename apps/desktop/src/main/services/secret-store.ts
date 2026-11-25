/**
 * Encrypted storage for API keys and tokens (the AI provider key, plugin
 * secrets such as a GitHub token).
 *
 * Values are encrypted with Electron's safeStorage, which uses the operating
 * system's keychain: Keychain on macOS, DPAPI on Windows, and the secret
 * service (GNOME Keyring / KWallet) on Linux. Only the encrypted bytes are
 * written to disk, in `secrets.json` in the user data folder, so copying
 * that file to another account or machine doesn't reveal anything.
 * (On Linux without a keyring, Electron falls back to a fixed built-in key,
 * which only hides values from casual viewing; `isWeak()` reports this so
 * the UI can say so.)
 *
 * Secret values never go to the UI process: main reads them when it needs
 * them (e.g. to call the AI provider) and the UI only learns whether one is
 * set.
 *
 * Keys are namespaced by whoever owns them, e.g. "ai.apiKey" or
 * "plugin:<plugin id>:<key>".
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** What SecretStore needs from Electron's safeStorage (a fake in tests). */
export interface Encryptor {
  isAvailable(): Promise<boolean>
  /** True when encryption uses a weak fallback key (Linux without a keyring). */
  isWeak(): boolean
  encrypt(plainText: string): Promise<Buffer>
  decrypt(encrypted: Buffer): Promise<string>
}

export class SecretStore {
  private readonly file: string
  private cache: Record<string, string> | null = null
  /** Serialises writes so two quick set() calls can't lose one. */
  private writing: Promise<void> = Promise.resolve()

  constructor(
    userDataDir: string,
    private readonly encryptor: Encryptor,
  ) {
    this.file = join(userDataDir, 'secrets.json')
  }

  /** Whether secrets can be stored on this system. */
  isAvailable(): Promise<boolean> {
    return this.encryptor.isAvailable()
  }

  isWeak(): boolean {
    return this.encryptor.isWeak()
  }

  has(key: string): boolean {
    return key in this.load()
  }

  /** The decrypted value, or undefined if not set (or no longer readable). */
  async get(key: string): Promise<string | undefined> {
    const stored = this.load()[key]
    if (stored === undefined) return undefined
    try {
      return await this.encryptor.decrypt(Buffer.from(stored, 'base64'))
    } catch {
      // Encrypted under another OS account or a reset keychain: treat as unset.
      return undefined
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new Error(
        'Trellis can’t store secrets because this system has no secure storage (on Linux, install and unlock GNOME Keyring or KWallet).',
      )
    }
    const encrypted = (await this.encryptor.encrypt(value)).toString('base64')
    await this.change((data) => ({ ...data, [key]: encrypted }))
  }

  async delete(key: string): Promise<void> {
    await this.change((data) => {
      const { [key]: _removed, ...rest } = data
      return rest
    })
  }

  /** Remove every key that starts with `prefix` (e.g. when a plugin is uninstalled). */
  async deletePrefix(prefix: string): Promise<void> {
    await this.change((data) =>
      Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith(prefix))),
    )
  }

  private load(): Record<string, string> {
    if (this.cache) return this.cache
    try {
      this.cache = existsSync(this.file)
        ? (JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, string>)
        : {}
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  private change(update: (data: Record<string, string>) => Record<string, string>) {
    const next = this.writing.then(() => {
      const data = update(this.load())
      this.cache = data
      mkdirSync(dirname(this.file), { recursive: true })
      // Write then rename, so a crash mid-write can't leave a broken file.
      const temp = `${this.file}.tmp`
      writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 })
      renameSync(temp, this.file)
    })
    this.writing = next.catch(() => {})
    return next
  }
}

/** The real Encryptor, backed by Electron's safeStorage. */
export function safeStorageEncryptor(safeStorage: Electron.SafeStorage): Encryptor {
  return {
    isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
    isWeak: () =>
      process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text',
    encrypt: (text) => safeStorage.encryptStringAsync(text),
    decrypt: async (buffer) => (await safeStorage.decryptStringAsync(buffer)).result,
  }
}
