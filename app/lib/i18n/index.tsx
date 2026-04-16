import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { en } from './en'
import { fr } from './fr'
import { zh } from './zh'

export type Locale = 'en' | 'fr' | 'zh'

export type Translations = Record<string, string>

const DICTIONARIES: Record<Locale, Translations> = { en, fr, zh }

const SUPPORTED: Record<string, Locale> = { en: 'en', fr: 'fr', zh: 'zh' }

function detectLocale(): Locale {
  if (typeof document !== 'undefined') {
    // Pre-hydrate script already detected and wrote this before React boots.
    const fromDom = document.documentElement.dataset.locale
    if (fromDom && fromDom in SUPPORTED) return fromDom as Locale
  }
  if (typeof navigator === 'undefined') return 'en'
  const lang = (navigator.language ?? 'en').slice(0, 2)
  return SUPPORTED[lang] ?? 'en'
}

type I18nCtx = {
  locale: Locale
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nCtx>({
  locale: 'en',
  t: (key) => key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale] = useState<Locale>(() => detectLocale())

  useEffect(() => {
    document.documentElement.lang = locale
    // The pre-hydrate script hid the page to prevent the English flash.
    // Now that React has rendered in the correct locale, show it.
    document.documentElement.style.visibility = ''
  }, [locale])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
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
