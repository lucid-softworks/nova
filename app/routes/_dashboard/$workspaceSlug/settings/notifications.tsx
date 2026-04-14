import { createFileRoute } from '@tanstack/react-router'
import { Card } from '~/components/ui/card'
import { SettingsNav } from '~/components/settings/SettingsNav'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/notifications')({
  component: NotificationsSettings,
})

function NotificationsSettings() {
  const { workspaceSlug } = Route.useParams()
  return (
    <div className="space-y-4">
      <SettingsNav workspaceSlug={workspaceSlug} active="notifications" />
      <Card>
        <div className="space-y-2 p-4">
          <h3 className="text-sm font-semibold text-neutral-900">Notification preferences</h3>
          <p className="text-sm text-neutral-500">
            Per-type in-app and email toggles land after a small schema addition
            (user.notificationPreferences jsonb). Until then, all in-app notifications are on and
            no emails are sent.
          </p>
        </div>
      </Card>
    </div>
  )
}
