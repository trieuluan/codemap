import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { loadEnv } from "../config/load-env";

loadEnv();

import { auth } from "../lib/auth";
import { db } from "../db";
import { role, user, userRole } from "../db/schema";

const seedEnvSchema = z.object({
  ADMIN_EMAIL: z.email().trim().toLowerCase(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_NAME: z.string().trim().min(1),
});

const ADMIN_ROLE_NAME = "admin";
const USER_ROLE_NAME = "user";

async function ensureRole(name: string, description: string) {
  const existingRole = await db.query.role.findFirst({
    where: eq(role.name, name),
  });

  if (existingRole) return existingRole;

  const [createdRole] = await db
    .insert(role)
    .values({ id: randomUUID(), name, description })
    .returning();

  return createdRole;
}

async function ensureAdminUser(adminName: string, adminEmail: string, adminPassword: string) {
  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, adminEmail),
  });

  if (existingUser) {
    return existingUser;
  }

  const result = await auth.api.signUpEmail({
    body: {
      name: adminName,
      email: adminEmail,
      password: adminPassword,
    },
  });

  return result.user;
}

async function ensureAdminRoleAssignment(userId: string, roleId: string) {
  await db
    .insert(userRole)
    .values({
      userId,
      roleId,
    })
    .onConflictDoNothing();
}

async function main() {
  const env = seedEnvSchema.parse(process.env);

  const [adminRole] = await Promise.all([
    ensureRole(ADMIN_ROLE_NAME, "System administrator"),
    ensureRole(USER_ROLE_NAME, "Regular authenticated user"),
  ]);

  const adminUser = await ensureAdminUser(
    env.ADMIN_NAME,
    env.ADMIN_EMAIL,
    env.ADMIN_PASSWORD,
  );

  await ensureAdminRoleAssignment(adminUser.id, adminRole.id);

  console.log(`Seed complete. Admin user: ${adminUser.email}`);
}

void main()
  .then(async () => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to seed default admin", error);
    process.exit(1);
  });
