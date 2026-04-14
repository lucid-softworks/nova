import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/settings/')({
  component: () => <Placeholder title="Settings — General" stage={16} />,
})
