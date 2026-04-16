import { lookup } from 'node:dns/promises'

/**
 * Resolve a hostname and reject if it points to a private / internal IP.
 * Prevents SSRF via user-controlled URLs (RSS feeds, webhooks, Mastodon instances).
 */
async function assertPublicHost(hostname: string): Promise<void> {
  // Block obviously internal hostnames
  const lower = hostname.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower === '[::1]'
  ) {
    throw new Error(`Blocked request to internal host: ${hostname}`)
  }

  let address: string
  try {
    const result = await lookup(hostname)
    address = result.address
  } catch {
    throw new Error(`DNS resolution failed for ${hostname}`)
  }

  if (isPrivateIP(address)) {
    throw new Error(`Blocked request to private IP: ${hostname}`)
  }
}

function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('172.')) {
    const second = Number.parseInt(ip.split('.')[1]!, 10)
    if (second >= 16 && second <= 31) return true
  }
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('127.')) return true
  if (ip.startsWith('0.')) return true
  if (ip.startsWith('169.254.')) return true // link-local
  if (ip === '::1' || ip === '::') return true

  // IPv6 private
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true // unique local
  if (ip.startsWith('fe80')) return true // link-local

  // Cloud metadata
  if (ip === '169.254.169.254') return true
  if (ip === 'fd00:ec2::254') return true

  return false
}

/**
 * Fetch a user-supplied URL with SSRF protection.
 * Resolves DNS first and blocks private/internal IPs.
 * Only allows http: and https: schemes.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const parsed = new URL(url)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTP scheme: ${parsed.protocol}`)
  }

  await assertPublicHost(parsed.hostname)

  return fetch(url, init)
}
