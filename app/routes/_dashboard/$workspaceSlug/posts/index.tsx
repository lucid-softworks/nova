import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/posts/')({
  component: () => <Placeholder title="Posts" stage={10} />,
})
