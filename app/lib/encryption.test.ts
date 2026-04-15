import { beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'

describe('encryption round-trip', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex')
  })

  it('encrypt → decrypt returns the original plaintext', async () => {
    const { encrypt, decrypt } = await import('./encryption')
    const plaintext = 'hello oauth token xyz-123'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toContain(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('rejects tampered ciphertext', async () => {
    const { encrypt, decrypt } = await import('./encryption')
    const ciphertext = encrypt('payload')
    const buf = Buffer.from(ciphertext, 'base64')
    // flip a byte inside the auth tag region
    buf[14]! ^= 0xff
    const tampered = buf.toString('base64')
    expect(() => decrypt(tampered)).toThrow()
  })

  it('rejects a payload shorter than iv+tag', async () => {
    const { decrypt } = await import('./encryption')
    expect(() => decrypt(Buffer.alloc(5).toString('base64'))).toThrow()
  })
})
