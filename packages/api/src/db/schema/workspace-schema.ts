import { randomUUID } from "node:crypto";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const workspaceTypeEnum = pgEnum("workspace_type", ["personal", "team"]);
export const workspacePlanEnum = pgEnum("workspace_plan", [
  "beta",
  "developer",
  "team",
]);
export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", [
  "owner",
  "admin",
  "member",
]);
export const usageEventTypeEnum = pgEnum("usage_event_type", [
  "project_created",
  "import_triggered",
  "parse_completed",
  "mcp_session_created",
]);

export const workspace = pgTable(
  "workspace",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: workspaceTypeEnum("type").default("personal").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    plan: workspacePlanEnum("plan").default("beta").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workspace_owner_user_id_idx").on(table.ownerUserId),
    uniqueIndex("workspace_slug_unique").on(table.slug),
  ],
);

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceMemberRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.userId],
      name: "workspace_member_pk",
    }),
    index("workspace_member_workspace_id_idx").on(table.workspaceId),
    index("workspace_member_user_id_idx").on(table.userId),
  ],
);

export const usageEvent = pgTable(
  "usage_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    type: usageEventTypeEnum("type").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("usage_event_workspace_id_idx").on(table.workspaceId),
    index("usage_event_workspace_type_created_idx").on(
      table.workspaceId,
      table.type,
      table.createdAt,
    ),
    index("usage_event_project_id_idx").on(table.projectId),
  ],
);
