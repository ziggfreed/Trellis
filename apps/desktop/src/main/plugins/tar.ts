/**
 * A minimal reader for tar archives, enough to unpack npm packages (which
 * are .tgz files: tar archives compressed with gzip).
 *
 * A tar file is a series of 512-byte blocks. Each entry is a header block
 * (name, size, type...) followed by its data, padded to a whole block. Two
 * empty blocks mark the end. Long names are stored either in the header's
 * "prefix" field (ustar) or in a "pax" extended header before the entry.
 *
 * Paths that would land outside the destination ("../x", "/etc/x") are
 * rejected, because an archive from the internet must never be able to
 * write anywhere else on disk.
 */

export interface TarEntry {
  path: string
  type: 'file' | 'directory'
  data: Buffer
}

const BLOCK = 512

/** Read a NUL-terminated string field from a header. */
function field(header: Buffer, offset: number, length: number): string {
  const raw = header.subarray(offset, offset + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? length : end).toString('utf8')
}

/** Numbers in tar headers are octal text. */
function octal(header: Buffer, offset: number, length: number): number {
  const text = field(header, offset, length).trim()
  return text ? parseInt(text, 8) : 0
}

/** Read the "path" value from a pax extended header ("<len> path=<value>\n" records). */
function paxPath(data: Buffer): string | null {
  let text = data.toString('utf8')
  while (text.length) {
    const space = text.indexOf(' ')
    const length = parseInt(text.slice(0, space), 10)
    if (!length || space === -1) break
    const record = text.slice(space + 1, length - 1)
    if (record.startsWith('path=')) return record.slice('path='.length)
    text = text.slice(length)
  }
  return null
}

/** True if `path` is relative and stays inside the folder it's unpacked into. */
export function isSafePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path))
    return false
  return !path.split(/[/\\]/).includes('..')
}

/** List the files and folders in a (decompressed) tar archive. */
export function readTar(archive: Buffer): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  let nextPath: string | null = null
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break // end of archive
    const size = octal(header, 124, 12)
    const type = String.fromCharCode(header[156] ?? 0)
    const dataStart = offset + BLOCK
    const data = archive.subarray(dataStart, dataStart + size)
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK

    if (type === 'x') {
      nextPath = paxPath(data) // applies to the next entry
      continue
    }
    if (type === 'g') continue // global pax header: nothing we need

    const prefix = field(header, 345, 155)
    const name = nextPath ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100))
    nextPath = null
    if (!isSafePath(name)) throw new Error(`The archive contains an unsafe path: ${name}`)

    if (type === '0' || type === '\0' || type === '7') {
      entries.push({ path: name, type: 'file', data: Buffer.from(data) })
    } else if (type === '5') {
      entries.push({ path: name.replace(/\/$/, ''), type: 'directory', data: Buffer.alloc(0) })
    }
    // Links and other special entries are skipped: plugins don't need them,
    // and links could point outside the folder.
  }
  return entries
}
