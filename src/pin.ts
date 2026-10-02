const STORAGE_KEY = 'paycycle.pin'

interface PinRecord {
  salt: string
  hash: string
}

const toHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

async function digest(pin: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}

function readRecord(): PinRecord | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) as PinRecord : null
  } catch {
    return null
  }
}

export const pinIsConfigured = () => Boolean(readRecord())

export async function configurePin(pin: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  const record = { salt, hash: await digest(pin, salt) }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
}

export async function verifyPin(pin: string) {
  const record = readRecord()
  if (!record) return false
  const candidate = await digest(pin, record.salt)
  return candidate === record.hash
}

export function removePin() {
  localStorage.removeItem(STORAGE_KEY)
}