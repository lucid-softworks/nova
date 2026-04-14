import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is required')
}

const queryClient = postgres(url, { prepare: false })
export const db = drizzle(queryClient, { schema, casing: 'snake_case' })
export type DB = typeof db
export { schema }
