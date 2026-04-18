export type WorkspaceRole = 'admin' | 'manager' | 'editor' | 'viewer'

export type SessionUser = {
  id: string
  email: string
  name: string
  image: string | null
  role: string | null
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

export type PlatformSurface = {
  maintenanceMode: boolean
  announcementBanner: string | null
  featureFlags: Record<string, boolean>
}

export type SessionContext = {
  user: SessionUser | null
  workspaces: WorkspaceSummary[]
  activeOrganizationId: string | null
  platform: PlatformSurface
  /** Set to the original admin's user id when the Better Auth admin
   * plugin is running in impersonation mode. `null` during normal use. */
  impersonatedBy: string | null
}
