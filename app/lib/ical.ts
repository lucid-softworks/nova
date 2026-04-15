/** Minimal iCalendar (RFC 5545) emitter. Good enough for a scheduled
 * posts feed consumed by Google/Apple/Outlook. */

export type IcsEvent = {
  uid: string
  start: Date
  end?: Date
  summary: string
  description?: string
  url?: string
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines > 75 octets must be folded with CRLF + space.
  if (line.length <= 75) return line
  const parts: string[] = []
  let i = 0
  while (i < line.length) {
    parts.push(line.slice(i, i + 75))
    i += 75
  }
  return parts.join('\r\n ')
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function fmt(d: Date): string {
  // UTC form: YYYYMMDDTHHMMSSZ
  const iso = d.toISOString()
  return (
    iso.slice(0, 4) +
    iso.slice(5, 7) +
    iso.slice(8, 10) +
    'T' +
    iso.slice(11, 13) +
    iso.slice(14, 16) +
    iso.slice(17, 19) +
    'Z'
  )
}

export function buildIcs(name: string, events: IcsEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//nova//scheduled-posts//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(name)}`),
  ]
  const stamp = fmt(new Date())
  for (const ev of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(foldLine(`UID:${ev.uid}`))
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${fmt(ev.start)}`)
    lines.push(`DTEND:${fmt(ev.end ?? new Date(ev.start.getTime() + 15 * 60 * 1000))}`)
    lines.push(foldLine(`SUMMARY:${escapeText(ev.summary)}`))
    if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeText(ev.description)}`))
    if (ev.url) lines.push(foldLine(`URL:${ev.url}`))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
