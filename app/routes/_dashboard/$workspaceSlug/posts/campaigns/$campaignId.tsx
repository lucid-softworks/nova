import { createFileRoute } from '@tanstack/react-router'
import { Placeholder } from '~/components/layout/Placeholder'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/posts/campaigns/$campaignId')({
  component: () => <Placeholder title="Campaign Detail" stage={10} />,
})
