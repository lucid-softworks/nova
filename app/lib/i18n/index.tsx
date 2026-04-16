import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { en, type TranslationKey } from './en'
import { fr } from './fr'
import { zh } from './zh'

export type Locale = 'en' | 'fr' | 'zh'
export type { TranslationKey }

type Translations = Record<string, string>

const DICTIONARIES: Record<Locale, Translations> = {
  en: en as Translations,
  fr,
  zh,
}

export const SUPPORTED_LOCALES: Record<string, Locale> = { en: 'en', fr: 'fr', zh: 'zh' }

/**
 * Parse the Accept-Language header and return the best supported locale.
 * Works server-side (in loaders) — no navigator needed.
 */
export function parseAcceptLanguage(header: string | null): Locale {
  if (!header) return 'en'
  for (const part of header.split(',')) {
    const lang = part.trim().split(';')[0]?.trim().slice(0, 2).toLowerCase()
    if (lang && lang in SUPPORTED_LOCALES) return SUPPORTED_LOCALES[lang]!
  }
  return 'en'
}

type I18nCtx = {
  locale: Locale
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nCtx>({
  locale: 'en',
  t: (key) => key,
})

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: ReactNode
}) {
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let str = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replaceAll(`{${k}}`, String(v))
        }
      }
      return str
    },
    [locale],
  )

  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useLocale() {
  return useContext(I18nContext)
}

export function useT() {
  return useContext(I18nContext).t
}
