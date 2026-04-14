import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/notifications')({
  component: () => <Placeholder title="Notification Settings" stage={16} />,
})
