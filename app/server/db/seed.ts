import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { auth } from '~/lib/auth'
import { db, schema } from './index'
import { eq } from 'drizzle-orm'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed script must not run in production')
    process.exit(1)
  }

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

  const existingOrg = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, 'acme'))
    .limit(1)

  if (existingOrg[0]) {
    console.log(`Workspace "acme" already exists`)
    return
  }

  const orgId = randomUUID()
  await db.insert(schema.organization).values({ id: orgId, name: 'Acme', slug: 'acme' })
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ organizationId: orgId })
    .returning()
  if (!workspace) throw new Error('Failed to create workspace')

  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: orgId,
    userId,
    role: 'admin',
  })

  console.log(`Created workspace "Acme" (${workspace.id}) for ${email}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
