import { drizzle } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import * as schema from './schema'

let _sql: Sql | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

function getDb() {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  _sql = postgres(url, { prepare: false })
  _db = drizzle(_sql, { schema, casing: 'snake_case' })
  return _db
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop) {
    const d = getDb()
    const value = (d as unknown as Record<string | symbol, unknown>)[prop as string]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(d) : value
  },
})

export { schema }
export type DB = typeof db
