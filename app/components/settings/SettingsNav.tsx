import { Link } from '@tanstack/react-router'
import { cn } from '~/lib/utils'
import { useT } from '~/lib/i18n'

const TABS = [
  { key: 'general', i18nKey: 'settings.general', to: '/$workspaceSlug/settings' as const },
  { key: 'schedule', i18nKey: 'settings.postingSchedule', to: '/$workspaceSlug/settings/schedule' as const },
  { key: 'notifications', i18nKey: 'settings.notifications', to: '/$workspaceSlug/settings/notifications' as const },
  { key: 'api', i18nKey: 'settings.apiWebhooks', to: '/$workspaceSlug/settings/api' as const },
  { key: 'security', i18nKey: 'settings.security', to: '/$workspaceSlug/settings/security' as const },
  { key: 'white-label', i18nKey: 'settings.whiteLabel', to: '/$workspaceSlug/settings/white-label' as const },
  { key: 'rss', i18nKey: 'settings.rssFeeds', to: '/$workspaceSlug/settings/rss' as const },
  { key: 'replies', i18nKey: 'settings.savedReplies', to: '/$workspaceSlug/settings/replies' as const },
  { key: 'bio', i18nKey: 'settings.bioPage', to: '/$workspaceSlug/settings/bio' as const },
  { key: 'billing', i18nKey: 'settings.billing', to: '/$workspaceSlug/settings/billing' as const },
] as const

export function SettingsNav({ workspaceSlug, active }: { workspaceSlug: string; active: string }) {
  const t = useT()
  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          params={{ workspaceSlug }}
          className={cn(
            'px-3 py-2 text-sm font-medium',
            active === tab.key
              ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100',
          )}
        >
          {t(tab.i18nKey)}
        </Link>
      ))}
    </div>
  )
}
