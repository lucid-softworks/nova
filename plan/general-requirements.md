## GENERAL REQUIREMENTS (all stages)

### Error handling
- All server functions return typed Zod-validated errors
- Forms: field-level inline errors via React Hook Form
- Global TanStack Start error boundary
- Toast (shadcn/ui `useToast`) for all async actions — success and error
- Confirmation modal for all destructive actions (delete, disconnect, regenerate key, etc.)

### Loading + empty states
- Skeleton loaders (`shadcn/ui Skeleton`) for all tables, grids, and charts while loading
- Empty states for every list/grid section: simple illustration (SVG inline) + descriptive text + primary CTA button

### Responsive design
- Sidebar: hamburger + overlay drawer on < 768px
- Tables: card layout on mobile
- Composer: stacks vertically (preview below editor) on mobile
- Campaign builder: full-width single column on mobile
- Calendar: list view (posts sorted by time) on mobile
- Reshare browser: full-screen slide-over on mobile

### Accessibility
- All interactive elements keyboard focusable
- Visible focus rings (never `outline: none` without a replacement)
- `aria-label` on all icon-only buttons
- Color never the only indicator of state (always paired with text or icon)
- Modal dialogs use `role="dialog"` + focus trap

### Keyboard shortcuts
- `N`: New post (open composer in Standard mode)
- `R`: Open Reshare Browser
- `?`: Open keyboard shortcuts help modal
- `Escape`: Close any open modal/popover/slide-over
- `Cmd+S` / `Ctrl+S`: Save draft when composer is focused

### Code conventions
- All server functions: Zod input schema + typed return type, no `any`
- All DB queries via Drizzle ORM (no raw SQL except complex analytics aggregations)
- File naming: `kebab-case.ts` for files, `PascalCase` for React components
- Shared types exported from `lib/types.ts`
- Each stage ends with a git commit: `feat: stage N — description`
- Update `.env.example` whenever new variables are introduced

---

*End of build plan. Start with Stage 1 and check in when complete.*
