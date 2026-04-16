/**
 * Minimal next-fire calculator for 5-field standard cron expressions
 * (minute hour day-of-month month day-of-week). Good enough for
 * recurring posts; doesn't support step (∕), L, W, # or year field.
 */

type CronFields = {
  minutes: Set<number>
  hours: Set<number>
  days: Set<number>
  months: Set<number>
  dows: Set<number>
}

function parseField(field: string, min: number, max: number): Set<number> {
  const set = new Set<number>()
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) set.add(i)
      continue
    }
    const rangeMatch = /^(\d+)-(\d+)$/.exec(part)
    if (rangeMatch) {
      const lo = Number(rangeMatch[1])
      const hi = Number(rangeMatch[2])
      for (let i = lo; i <= hi; i++) set.add(i)
      continue
    }
    const n = Number(part)
    if (!Number.isNaN(n) && n >= min && n <= max) set.add(n)
  }
  return set
}

function parse(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expr}`)
  return {
    minutes: parseField(parts[0]!, 0, 59),
    hours: parseField(parts[1]!, 0, 23),
    days: parseField(parts[2]!, 1, 31),
    months: parseField(parts[3]!, 1, 12),
    dows: parseField(parts[4]!, 0, 6),
  }
}

function matches(d: Date, f: CronFields): boolean {
  return (
    f.minutes.has(d.getUTCMinutes()) &&
    f.hours.has(d.getUTCHours()) &&
    f.days.has(d.getUTCDate()) &&
    f.months.has(d.getUTCMonth() + 1) &&
    f.dows.has(d.getUTCDay())
  )
}

/**
 * Returns the next Date (UTC) after `after` that matches `expr`.
 * Scans up to 400 days ahead to avoid infinite loops on impossible
 * expressions; throws if none found.
 */
export function nextCronFire(expr: string, after: Date = new Date()): Date {
  const fields = parse(expr)
  const d = new Date(after)
  d.setUTCSeconds(0, 0)
  d.setUTCMinutes(d.getUTCMinutes() + 1)
  const limit = new Date(d.getTime() + 400 * 24 * 3600 * 1000)
  while (d < limit) {
    if (matches(d, fields)) return d
    d.setUTCMinutes(d.getUTCMinutes() + 1)
  }
  throw new Error(`No cron match found within 400 days for "${expr}"`)
}
