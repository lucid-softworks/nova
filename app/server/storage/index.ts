import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'

export type PutOptions = {
  contentType: string
  contentLength?: number
  cacheControl?: string
}

export interface StorageDriver {
  put(key: string, body: Buffer, opts: PutOptions): Promise<void>
  getBuffer(key: string): Promise<Buffer>
  getRange(key: string, start: number, endInclusive: number): Promise<Buffer>
  delete(key: string): Promise<void>
  publicUrl(key: string): string
}

class S3Driver implements StorageDriver {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBase: string

  constructor() {
    const region = process.env.AWS_REGION ?? 'auto'
    const endpoint = process.env.S3_ENDPOINT ?? process.env.AWS_S3_ENDPOINT ?? undefined
    this.bucket = process.env.AWS_BUCKET ?? ''
    if (!this.bucket) throw new Error('AWS_BUCKET is required for object storage')
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint,
      credentials:
        accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    })
    const configuredBase = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, '')
    if (configuredBase) {
      this.publicBase = configuredBase
    } else if (endpoint) {
      this.publicBase = `${endpoint.replace(/\/+$/, '')}/${this.bucket}`
    } else {
      this.publicBase = `https://${this.bucket}.s3.${region}.amazonaws.com`
    }
  }

  async put(key: string, body: Buffer, opts: PutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: opts.contentType,
        ContentLength: opts.contentLength ?? body.length,
        CacheControl: opts.cacheControl,
      }),
    )
  }

  private async streamToBuffer(res: GetObjectCommandOutput): Promise<Buffer> {
    const chunks: Buffer[] = []
    const body = res.Body as AsyncIterable<Uint8Array> | undefined
    if (!body) throw new Error('S3 GetObject returned empty body')
    for await (const c of body) chunks.push(Buffer.from(c))
    return Buffer.concat(chunks)
  }

  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    return this.streamToBuffer(res)
  }

  async getRange(key: string, start: number, endInclusive: number): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${start}-${endInclusive}`,
      }),
    )
    return this.streamToBuffer(res)
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`
  }
}

let cached: StorageDriver | null = null

export function getStorage(): StorageDriver {
  if (!cached) cached = new S3Driver()
  return cached
}

/**
 * Resolve a `mediaAssets.url` value back to its storage key. Assumes the
 * key is the final path segment of the stored URL (composer uploads never
 * use nested prefixes).
 */
export function keyFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    return segs[segs.length - 1] ?? null
  } catch {
    return null
  }
}
