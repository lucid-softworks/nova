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
    lower === '[::1]' ||
    lower === '[::]'
  ) {
    throw new Error(`Blocked request to internal host: ${hostname}`)
  }

  // Strip IPv6 brackets before lookup so hosts like [::ffff:127.0.0.1]
  // can still be probed correctly. lookup returns what DNS serves, which
  // includes IPv4-mapped IPv6 — isPrivateIP normalises those back.
  const toResolve = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower

  // Ask for all address families so an attacker can't smuggle an internal
  // IPv6 address past a filter that only saw IPv4.
  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(toResolve, { all: true })
  } catch {
    throw new Error(`DNS resolution failed for ${hostname}`)
  }

  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      throw new Error(`Blocked request to private IP: ${hostname}`)
    }
  }
}

function isPrivateIP(ip: string): boolean {
  // Normalise IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) to its IPv4 form
  // so the IPv4 checks below catch loopback/private addresses that an
  // attacker might squeeze through via an AAAA record.
  const lower = ip.toLowerCase()
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIP(mapped[1]!)

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
  // RFC 6598 carrier-grade NAT — internal to many cloud providers.
  if (ip.startsWith('100.')) {
    const second = Number.parseInt(ip.split('.')[1]!, 10)
    if (second >= 64 && second <= 127) return true
  }
  // IPv4 multicast + reserved
  const first = Number.parseInt(ip.split('.')[0]!, 10)
  if (!Number.isNaN(first) && first >= 224) return true

  // IPv6 loopback + unspecified (including IPv4-mapped forms above)
  if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1') return true

  // IPv6 private
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
  if (lower.startsWith('fe80')) return true // link-local
  // IPv6 multicast
  if (lower.startsWith('ff')) return true

  // Cloud metadata
  if (ip === '169.254.169.254') return true
  if (lower === 'fd00:ec2::254') return true

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
