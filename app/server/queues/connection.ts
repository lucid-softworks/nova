import IORedis, { type RedisOptions } from 'ioredis'

let client: IORedis | null = null

export function getRedis(): IORedis {
  if (client) return client
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL is required')
  const opts: RedisOptions = { maxRetriesPerRequest: null }
  client = new IORedis(url, opts)
  return client
}
