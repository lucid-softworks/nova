import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/api')({
  component: () => <Placeholder title="API & Webhooks" stage={16} />,
})
