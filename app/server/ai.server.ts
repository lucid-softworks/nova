import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText, type LanguageModel } from 'ai'
import { eq } from 'drizzle-orm'
import { db, schema } from './db'
import { decrypt } from '~/lib/encryption'
import { logger } from '~/lib/logger'
import { PLATFORMS, type PlatformKey } from '~/lib/platforms'
import { getProvider, type ProviderEntry } from '~/lib/ai/providers'

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

type ResolvedModel = { model: LanguageModel; providerLabel: string }

function buildModel(
  entry: ProviderEntry,
  apiKey: string,
  overrideModel: string | null,
  overrideBaseURL: string | null,
): LanguageModel {
  const modelId = (overrideModel?.trim() || entry.defaultModel || '').trim()
  if (!modelId) {
    throw new Error(`Provider "${entry.label}" requires a model to be set in workspace settings.`)
  }
  switch (entry.kind) {
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId)
    case 'openai':
      return createOpenAI({ apiKey })(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId)
    case 'openai-compatible': {
      const baseURL = overrideBaseURL?.trim() || entry.baseURL
      if (!baseURL) {
        throw new Error(`Provider "${entry.label}" requires a base URL.`)
      }
      return createOpenAICompatible({ name: entry.id, apiKey, baseURL })(modelId)
    }
  }
}

/**
 * Resolve a language model for the workspace.
 *  1. Load the workspace's selected provider + encrypted key/model/baseURL.
 *  2. If no workspace key, fall back to the provider's platform-wide env var.
 *  3. Build the model via the matching AI SDK package.
 * Returns null when no key is available anywhere.
 */
async function resolveModel(workspaceId: string | null): Promise<ResolvedModel | null> {
  let providerId = 'anthropic'
  let workspaceKey: string | null = null
  let modelOverride: string | null = null
  let baseURLOverride: string | null = null

  if (workspaceId) {
    const ws = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, workspaceId),
      columns: { aiProvider: true, aiConfig: true },
    })
    if (ws) {
      providerId = ws.aiProvider || 'anthropic'
      const cfg = (ws.aiConfig ?? {})[providerId]
      if (cfg) {
        modelOverride = cfg.model ?? null
        baseURLOverride = cfg.baseURL ?? null
        if (cfg.key) {
          try {
            workspaceKey = decrypt(cfg.key)
          } catch (err) {
            logger.warn({ err, workspaceId, providerId }, 'failed to decrypt workspace AI key')
          }
        }
      }
    }
  }

  const entry = getProvider(providerId)
  if (!entry) return null
  const apiKey = workspaceKey ?? (entry.envKey ? (process.env[entry.envKey] ?? null) : null)
  if (!apiKey) return null
  return {
    model: buildModel(entry, apiKey, modelOverride, baseURLOverride),
    providerLabel: entry.label,
  }
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
  const resolved = await resolveModel(workspaceId)
  if (!resolved) {
    throw new Error(
      'No AI provider configured. Add a key in workspace Settings → AI keys.',
    )
  }
  const system = buildSystemPrompt(req)
  const userPrompt = buildUserPrompt(req)
  // Shared error box — populated from onError if the provider emits an
  // error event instead of throwing from the iterator. Callers consume it
  // after streaming to append a "[<provider> error: ...]" trailer.
  const errorBox: { current: unknown } = { current: null }
  const result = streamText({
    model: resolved.model,
    system,
    prompt: userPrompt,
    maxTokens: 800,
    temperature: 0.8,
    onError: ({ error }) => {
      errorBox.current = error
      logger.error(
        { err: error, provider: resolved.providerLabel },
        'AI stream error',
      )
    },
  })
  return { result, providerLabel: resolved.providerLabel, errorBox }
}

export async function suggestHashtagsImpl(
  content: string,
  platforms: PlatformKey[],
  workspaceId: string | null,
): Promise<string[]> {
  const resolved = await resolveModel(workspaceId)
  if (!resolved) {
    throw new Error(
      'No AI provider configured. Add a key in workspace Settings → AI keys.',
    )
  }
  const platformNote = platforms.length
    ? `Target platforms: ${platforms.join(', ')}. Note: Bluesky doesn't use hashtags.`
    : ''
  const result = streamText({
    model: resolved.model,
    prompt: `Suggest 5-8 relevant hashtags for this social media post. Return ONLY the hashtags separated by spaces, no explanation. ${platformNote}\n\nPost: ${content.slice(0, 500)}`,
    maxTokens: 200,
    temperature: 0.6,
    onError: ({ error }) => {
      logger.error(
        { err: error, provider: resolved.providerLabel },
        'AI stream error (hashtags)',
      )
    },
  })
  let text: string
  try {
    text = await result.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI request failed'
    throw new Error(`${resolved.providerLabel} error: ${msg}`)
  }
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.startsWith('#') && t.length > 1)
    .slice(0, 10)
}
