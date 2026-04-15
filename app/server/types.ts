export type WorkspaceRole = 'admin' | 'manager' | 'editor' | 'viewer'

export type SessionUser = {
  id: string
  email: string
  name: string
  image: string | null
}

export type WorkspaceSummary = {
  id: string
  organizationId: string
  name: string
  slug: string
  role: WorkspaceRole
  logoUrl: string | null
  appName: string | null
}

export type SessionContext = {
  user: SessionUser | null
  workspaces: WorkspaceSummary[]
  activeOrganizationId: string | null
}
