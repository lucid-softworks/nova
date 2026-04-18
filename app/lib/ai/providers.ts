/**
 * Provider registry for BYO AI keys. Each entry describes:
 *  - `label`: human name for the settings UI
 *  - `defaultModel`: model id used when the workspace doesn't override
 *  - `envKey`: platform-wide env var used when the workspace has no key
 *  - `baseURL`: OpenAI-compatible endpoint (only for `openai-compatible` kind)
 *  - `kind`: which Vercel AI SDK package to instantiate
 *
 * Three native providers (`anthropic`, `openai`, `google`) use their own
 * SDK packages. Everything else rides on @ai-sdk/openai-compatible.
 */
export type ProviderKind = 'anthropic' | 'openai' | 'google' | 'openai-compatible'

export type ProviderEntry = {
  id: string
  label: string
  kind: ProviderKind
  defaultModel: string
  envKey: string | null
  baseURL?: string
  /** If true, the model is not fixed — users should pick one themselves. */
  requiresUserModel?: boolean
  /** If true, the user also supplies a baseURL (for fully-custom endpoints). */
  requiresUserBaseURL?: boolean
  /** Link shown as help text in the UI. */
  signupUrl?: string
}

export const PROVIDERS: Record<string, ProviderEntry> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    envKey: 'ANTHROPIC_API_KEY',
    signupUrl: 'https://console.anthropic.com/',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    signupUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    kind: 'google',
    defaultModel: 'gemini-2.5-flash',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    signupUrl: 'https://aistudio.google.com/apikey',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    defaultModel: 'anthropic/claude-sonnet-4-5',
    envKey: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    requiresUserModel: true,
    signupUrl: 'https://openrouter.ai/keys',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    kind: 'openai-compatible',
    defaultModel: 'MiniMax-Text-01',
    envKey: 'MINIMAX_API_KEY',
    baseURL: 'https://api.minimaxi.chat/v1',
    signupUrl: 'https://www.minimaxi.com/user-center/basic-information/interface-key',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    defaultModel: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    signupUrl: 'https://console.groq.com/keys',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    defaultModel: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    signupUrl: 'https://platform.deepseek.com/api_keys',
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    kind: 'openai-compatible',
    defaultModel: '',
    envKey: null,
    requiresUserModel: true,
    requiresUserBaseURL: true,
  },
}

export type ProviderId = string

export const PROVIDER_IDS = Object.keys(PROVIDERS)

export function isProviderId(x: string): x is ProviderId {
  return x in PROVIDERS
}

export function getProvider(id: string): ProviderEntry | null {
  return isProviderId(id) ? PROVIDERS[id] ?? null : null
}
