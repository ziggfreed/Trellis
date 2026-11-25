import { describe, expect, it } from 'vitest'
import { isSafePath, readTar } from './tar'

/** Build a tar header + data for one entry (just the fields readTar uses). */
function entry(
  name: string,
  content: string | null,
  options: { prefix?: string; type?: string } = {},
) {
  const data = Buffer.from(content ?? '')
  const header = Buffer.alloc(512)
  header.write(name, 0, 'utf8')
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii')
  header.write(options.type ?? (content === null ? '5' : '0'), 156, 'ascii')
  if (options.prefix) header.write(options.prefix, 345, 'utf8')
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512)
  data.copy(padded)
  return Buffer.concat([header, padded])
}
const end = Buffer.alloc(1024)

describe('readTar', () => {
  it('reads files and folders, including long names', () => {
    const pax = 'path=package/a/very/long/name.js'
    const record = `${pax.length + 4} ${pax}\n`
    const archive = Buffer.concat([
      entry('package/', null),
      entry('package/package.json', '{"name":"x"}'),
      entry('index.js', 'export {}', { prefix: 'package/dist' }),
      entry('PaxHeader', record, { type: 'x' }),
      entry('short', 'long one'),
      end,
    ])
    expect(readTar(archive).map((e) => [e.path, e.type, e.data.toString()])).toEqual([
      ['package', 'directory', ''],
      ['package/package.json', 'file', '{"name":"x"}'],
      ['package/dist/index.js', 'file', 'export {}'],
      ['package/a/very/long/name.js', 'file', 'long one'],
    ])
  })

  it('refuses paths that escape the destination', () => {
    expect(() => readTar(Buffer.concat([entry('package/../../evil', 'x'), end]))).toThrow(/unsafe/)
    expect(isSafePath('/etc/passwd')).toBe(false)
    expect(isSafePath('C:\\Windows\\x')).toBe(false)
    expect(isSafePath('package/ok.js')).toBe(true)
  })
})
