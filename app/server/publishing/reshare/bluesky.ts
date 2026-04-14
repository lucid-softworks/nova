import { eq } from 'drizzle-orm'
import { db, schema } from '~/server/db'
import { encrypt } from '~/lib/encryption'
import { PublishError } from '../errors'
import type { PublishResult, ReshareContext } from '../index'

const SERVICE = 'https://bsky.social'

type Session = { did: string; accessJwt: string; refreshJwt: string }

async function refreshSession(refreshJwt: string): Promise<Session> {
  const res = await fetch(`${SERVICE}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshJwt}` },
  })
  if (!res.ok) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'refreshSession failed',
      userMessage: 'Bluesky session expired — reconnect.',
      retryable: false,
    })
  }
  return (await res.json()) as Session
}

async function createRecord(
  session: Session,
  record: Record<string, unknown>,
  collection: string,
): Promise<{ uri: string; cid: string }> {
  const res = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ repo: session.did, collection, record }),
  })
  if (!res.ok) {
    const txt = await res.text()
    if (res.status === 401) {
      throw new PublishError({
        code: 'AUTH_EXPIRED',
        message: 'createRecord 401',
        userMessage: 'Bluesky session expired — reconnect.',
        retryable: false,
      })
    }
    throw new PublishError({
      code: 'UNKNOWN',
      message: `createRecord ${res.status}: ${txt.slice(0, 300)}`,
      userMessage: 'Bluesky reshare failed.',
    })
  }
  return (await res.json()) as { uri: string; cid: string }
}

async function persistRefreshed(accountId: string, s: Session) {
  await db
    .update(schema.socialAccounts)
    .set({
      accessToken: encrypt(s.accessJwt),
      refreshToken: encrypt(s.refreshJwt),
      lastSyncedAt: new Date(),
    })
    .where(eq(schema.socialAccounts.id, accountId))
}

async function getPostCid(session: Session, uri: string): Promise<string | null> {
  // getPosts accepts up to 25 URIs; we just need this one.
  const url = `${SERVICE}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.accessJwt}`, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { posts?: { uri: string; cid: string }[] }
  return json.posts?.[0]?.cid ?? null
}

export async function resharePost(ctx: ReshareContext): Promise<PublishResult> {
  const did = (ctx.account.metadata.did as string) ?? ''
  if (!did) {
    throw new PublishError({
      code: 'AUTH_EXPIRED',
      message: 'Bluesky account missing did',
      userMessage: 'Bluesky account not connected properly — reconnect.',
      retryable: false,
    })
  }
  let session: Session = {
    did,
    accessJwt: ctx.account.accessToken,
    refreshJwt: ctx.account.refreshToken ?? '',
  }

  // Pull the cached cid written at queue time.
  let cid = await loadStoredCidForSource(ctx.reshare.sourcePostId)
  if (!cid) cid = await getPostCid(session, ctx.reshare.sourcePostId)
  if (!cid) {
    throw new PublishError({
      code: 'UNKNOWN',
      message: 'Missing source cid for Bluesky reshare',
      userMessage: 'Could not resolve the original post — re-select from the browser.',
      retryable: false,
    })
  }

  const run = async () => {
    if (ctx.reshare.reshareType === 'repost') {
      return createRecord(
        session,
        {
          $type: 'app.bsky.feed.repost',
          subject: { uri: ctx.reshare.sourcePostId, cid },
          createdAt: new Date().toISOString(),
        },
        'app.bsky.feed.repost',
      )
    }
    return createRecord(
      session,
      {
        $type: 'app.bsky.feed.post',
        text: ctx.reshare.quoteComment ?? '',
        createdAt: new Date().toISOString(),
        langs: ['en'],
        embed: {
          $type: 'app.bsky.embed.record',
          record: { uri: ctx.reshare.sourcePostId, cid },
        },
      },
      'app.bsky.feed.post',
    )
  }

  let res: { uri: string; cid: string }
  try {
    res = await run()
  } catch (e) {
    if (e instanceof PublishError && e.code === 'AUTH_EXPIRED' && session.refreshJwt) {
      session = await refreshSession(session.refreshJwt)
      await persistRefreshed(ctx.account.id, session)
      res = await run()
    } else {
      throw e
    }
  }

  const rkey = res.uri.split('/').pop() ?? ''
  return {
    platformPostId: res.uri,
    url: `https://bsky.app/profile/${session.did}/post/${rkey}`,
    publishedAt: new Date(),
  }
}

async function loadStoredCidForSource(sourceUri: string): Promise<string | null> {
  // Join post_reshare_details -> post_versions to retrieve the cid stored at
  // queue time in platformVariables.
  const rows = await db
    .select({ vars: schema.postVersions.platformVariables })
    .from(schema.postReshareDetails)
    .innerJoin(
      schema.postVersions,
      eq(schema.postVersions.postId, schema.postReshareDetails.postId),
    )
    .where(eq(schema.postReshareDetails.sourcePostId, sourceUri))
    .limit(1)
  const vars = rows[0]?.vars as Record<string, unknown> | undefined
  return typeof vars?.cid === 'string' ? vars.cid : null
}
