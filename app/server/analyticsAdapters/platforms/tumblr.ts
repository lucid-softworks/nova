import type { AccountSnapshot, AnalyticsAccountCtx, PostSnapshot } from '../types'

const API = 'https://api.tumblr.com/v2'

function blog(ctx: AnalyticsAccountCtx): string {
  return (ctx.metadata.blog as string | undefined) ?? ctx.accountHandle
}

export async function syncAccount(ctx: AnalyticsAccountCtx): Promise<AccountSnapshot> {
  const res = await fetch(`${API}/blog/${blog(ctx)}/info`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  })
  if (!res.ok) return {}
  const json = (await res.json()) as {
    response?: { blog?: { followers?: number; posts?: number } }
  }
  const b = json.response?.blog
  if (!b) return {}
  return {
    followers: b.followers ?? 0,
    posts: b.posts ?? 0,
  }
}

export async function syncPosts(ctx: AnalyticsAccountCtx): Promise<PostSnapshot[]> {
  if (ctx.platformPostIds.length === 0) return []
  const out: PostSnapshot[] = []
  for (const id of ctx.platformPostIds) {
    const res = await fetch(`${API}/blog/${blog(ctx)}/posts?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    })
    if (!res.ok) continue
    const json = (await res.json()) as {
      response?: { posts?: Array<{ id_string?: string; note_count?: number }> }
    }
    const p = json.response?.posts?.[0]
    if (!p?.id_string) continue
    out.push({
      platformPostId: p.id_string,
      engagements: p.note_count ?? 0,
    })
  }
  return out
}
