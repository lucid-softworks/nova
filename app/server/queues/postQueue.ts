import { Queue } from 'bullmq'
import { getRedis } from './connection'

export type PostJobData = {
  postId: string
  workspaceId: string
}

let queue: Queue<PostJobData> | null = null

export function getPostQueue(): Queue<PostJobData> {
  if (queue) return queue
  queue = new Queue<PostJobData>('posts', {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  })
  return queue
}
