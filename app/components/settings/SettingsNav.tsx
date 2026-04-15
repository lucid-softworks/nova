import { Link } from '@tanstack/react-router'
import { cn } from '~/lib/utils'

const TABS = [
  { key: 'general', label: 'General', to: '/$workspaceSlug/settings' as const },
  { key: 'schedule', label: 'Posting Schedule', to: '/$workspaceSlug/settings/schedule' as const },
  { key: 'notifications', label: 'Notifications', to: '/$workspaceSlug/settings/notifications' as const },
  { key: 'api', label: 'API & Webhooks', to: '/$workspaceSlug/settings/api' as const },
  { key: 'security', label: 'Security', to: '/$workspaceSlug/settings/security' as const },
  { key: 'white-label', label: 'White Label', to: '/$workspaceSlug/settings/white-label' as const },
  { key: 'billing', label: 'Billing', to: '/$workspaceSlug/settings/billing' as const },
] as const

export function SettingsNav({ workspaceSlug, active }: { workspaceSlug: string; active: string }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-200">
      {TABS.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          params={{ workspaceSlug }}
          className={cn(
            'px-3 py-2 text-sm font-medium',
            active === t.key
              ? 'border-b-2 border-indigo-500 text-indigo-600'
              : 'text-neutral-600 hover:text-neutral-900',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
