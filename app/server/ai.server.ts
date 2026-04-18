import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { eq } from 'drizzle-orm'
import { db, schema } from './db'
import { decrypt } from '~/lib/encryption'
import { logger } from '~/lib/logger'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'

export type Tone = 'professional' | 'casual' | 'funny' | 'persuasive' | 'inspirational'
export type Length = 'short' | 'medium' | 'long'
export type ImproveAction =
  | 'shorten'
  | 'more_engaging'
  | 'fix_grammar'
  | 'add_hashtags'
  | 'change_tone'
  | 'rewrite'

export type GenerateRequest = {
  mode: 'generate' | 'improve' | 'hashtags'
  platforms: PlatformKey[]
  tone: Tone | null
  length: Length | null
  workspaceName: string | null
  prompt: string | null
  existingContent: string | null
  improveAction: ImproveAction | null
  campaign?: {
    stepNumber: number
    priorPlatforms: PlatformKey[]
  } | null
  reshareSource?: {
    sourceContent: string
    sourcePlatform: PlatformKey
  } | null
}

const MODEL = 'claude-sonnet-4-5'

/**
 * Resolve the Anthropic client for a workspace. If the workspace has a
 * BYO key stored (encrypted), use that; otherwise fall back to the
 * platform-wide ANTHROPIC_API_KEY. Returns null when no key is
 * available anywhere — caller should surface that to the user.
 */
async function anthropicFor(workspaceId: string | null): Promise<ReturnType<typeof createAnthropic> | null> {
  if (workspaceId) {
    const ws = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, workspaceId),
      columns: { aiAnthropicKey: true },
    })
    if (ws?.aiAnthropicKey) {
      try {
        const apiKey = decrypt(ws.aiAnthropicKey)
        if (apiKey) return createAnthropic({ apiKey })
      } catch (err) {
        logger.warn({ err, workspaceId }, 'failed to decrypt workspace Anthropic key')
      }
    }
  }
  if (process.env.ANTHROPIC_API_KEY) return anthropic
  return null
}

function buildSystemPrompt(req: GenerateRequest): string {
  const lines: string[] = []
  lines.push(
    'You are a social media copywriter helping compose posts. Output ONLY the post text — no preface, no commentary, no markdown code fences, no quote marks.',
  )
  if (req.workspaceName) lines.push(`Brand: ${req.workspaceName}.`)
  if (req.platforms.length > 0) {
    const constraints = req.platforms
      .map((p) => {
        const cfg = PLATFORMS[p]
        return `${cfg.label} (${cfg.textLimit} char max)`
      })
      .join(', ')
    lines.push(`Optimise for: ${constraints}.`)
    const minLimit = Math.min(...req.platforms.map((p) => PLATFORMS[p].textLimit))
    lines.push(`Hard cap: ${minLimit} characters.`)
  }
  if (req.tone) lines.push(`Tone: ${req.tone}.`)
  if (req.length) {
    const guide =
      req.length === 'short'
        ? 'Keep it to one or two short sentences.'
        : req.length === 'medium'
          ? 'Two to four sentences.'
          : 'Four to eight sentences, but keep it tight.'
    lines.push(`Length: ${guide}`)
  }
  if (req.campaign) {
    lines.push(
      `Context: this is step ${req.campaign.stepNumber} of a multi-part campaign. Prior steps posted to ${req.campaign.priorPlatforms
        .map((p) => PLATFORMS[p].label)
        .join(', ')}. The user may add a link back to those via template variables like {step1_youtube_url} — don't invent real URLs.`,
    )
  }
  if (req.reshareSource) {
    lines.push(
      `You are writing a short quote/commentary that accompanies a reshare of this ${PLATFORMS[req.reshareSource.sourcePlatform].label} post: "${req.reshareSource.sourceContent.slice(0, 500)}"`,
    )
  }
  return lines.join('\n')
}

function buildUserPrompt(req: GenerateRequest): string {
  if (req.mode === 'hashtags') {
    const base = req.existingContent?.trim() || req.prompt?.trim() || ''
    return `Suggest 10–15 relevant hashtags for this post. Return only the hashtags, space-separated, each starting with #. No commentary.\n\nPost:\n${base}`
  }
  if (req.mode === 'improve') {
    const existing = req.existingContent ?? ''
    switch (req.improveAction) {
      case 'shorten':
        return `Rewrite the following post to be significantly shorter while keeping the core message:\n\n${existing}`
      case 'more_engaging':
        return `Rewrite the following post to be more engaging — a stronger hook, more vivid language, a clearer call to action if appropriate:\n\n${existing}`
      case 'fix_grammar':
        return `Fix grammar, spelling, and punctuation in the following post. Preserve the voice and meaning:\n\n${existing}`
      case 'add_hashtags':
        return `Keep the following post as is but add a handful of relevant hashtags at the end:\n\n${existing}`
      case 'change_tone':
        return `Rewrite the following post in a ${req.tone ?? 'different'} tone:\n\n${existing}`
      case 'rewrite':
      default:
        return `Rewrite the following post completely with the same core topic and intent:\n\n${existing}`
    }
  }
  return req.prompt ?? 'Write a compelling social media post.'
}

export async function startGeneration(req: GenerateRequest, workspaceId: string | null) {
  const provider = await anthropicFor(workspaceId)
  if (!provider) {
    throw new Error(
      'No Anthropic API key configured. Add one in workspace settings or set ANTHROPIC_API_KEY on the server.',
    )
  }
  const system = buildSystemPrompt(req)
  const userPrompt = buildUserPrompt(req)
  const result = streamText({
    model: provider(MODEL),
    system,
    prompt: userPrompt,
    maxTokens: 800,
    temperature: 0.8,
  })
  return result
}

export async function suggestHashtagsImpl(
  content: string,
  platforms: PlatformKey[],
  workspaceId: string | null,
): Promise<string[]> {
  const provider = await anthropicFor(workspaceId)
  if (!provider) {
    throw new Error(
      'No Anthropic API key configured. Add one in workspace settings or set ANTHROPIC_API_KEY on the server.',
    )
  }
  const platformNote = platforms.length
    ? `Target platforms: ${platforms.join(', ')}. Note: Bluesky doesn't use hashtags.`
    : ''
  const result = await streamText({
    model: provider('claude-haiku-4-5-20251001'),
    prompt: `Suggest 5-8 relevant hashtags for this social media post. Return ONLY the hashtags separated by spaces, no explanation. ${platformNote}\n\nPost: ${content.slice(0, 500)}`,
    maxTokens: 200,
    temperature: 0.6,
  })
  const text = await result.text
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.startsWith('#') && t.length > 1)
    .slice(0, 10)
}
