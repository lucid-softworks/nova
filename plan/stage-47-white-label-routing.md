## STAGE 47 — Per-domain white-label routing

White-label settings (appName, logo, colours) already exist per
workspace. This stage adds host-header routing so each workspace can
be accessed via its own custom domain.

### Scope

- `workspaces.customDomain text unique nullable` column
- Middleware that reads the Host header, looks up the workspace by
  customDomain, and sets it as the active workspace in the route
  context
- DNS verification flow (TXT record check) before activating
- Settings → White Label gains a "Custom domain" field with verify
  + activate buttons
