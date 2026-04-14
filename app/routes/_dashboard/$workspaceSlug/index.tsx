import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_dashboard/$workspaceSlug/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$workspaceSlug/compose',
      params: { workspaceSlug: params.workspaceSlug },
    })
  },
})
