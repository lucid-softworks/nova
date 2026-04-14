import 'dotenv/config'
import { auth } from '~/lib/auth'
import { db, schema } from './index'
import { eq } from 'drizzle-orm'

async function main() {
  const email = 'test@example.com'
  const password = 'password123'
  const name = 'Test User'

  const existing = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1)
  let userId: string
  if (existing[0]) {
    userId = existing[0].id
    console.log(`User ${email} already exists (${userId})`)
  } else {
    const result = await auth.api.signUpEmail({ body: { email, password, name } })
    if (!result?.user?.id) throw new Error('Failed to create user via Better Auth')
    userId = result.user.id
    console.log(`Created user ${email} (${userId})`)
  }

  // Promote the seeded user to platform-admin for Stage 21's /admin console.
  await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, userId))

  const existingWorkspace = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, 'acme'))
    .limit(1)

  if (existingWorkspace[0]) {
    console.log(`Workspace "acme" already exists`)
    return
  }

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ name: 'Acme', slug: 'acme', ownerId: userId })
    .returning()
  if (!workspace) throw new Error('Failed to create workspace')

  await db.insert(schema.workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: 'admin',
    joinedAt: new Date(),
  })

  console.log(`Created workspace "${workspace.name}" (${workspace.id}) for ${email}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
