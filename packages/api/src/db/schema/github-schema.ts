import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/**
 * Stores GitHub OAuth connections for users who have authorized CodeMap
 * to access their private repositories (scope: repo).
 * This is separate from Better Auth's social login — it specifically
 * tracks repository access grants.
 */
export const userGithubConnection = pgTable(
  "user_github_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    githubUserId: integer("github_user_id").notNull(),
    githubLogin: text("github_login").notNull(),
    accessToken: text("access_token").notNull(),
    tokenType: text("token_type").notNull().default("bearer"),
    scope: text("scope").notNull(),
    connectedAt: timestamp("connected_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("user_github_connection_userId_idx").on(table.userId),
    index("user_github_connection_githubUserId_idx").on(table.githubUserId),
  ],
);

export const userGithubConnectionRelations = relations(
  userGithubConnection,
  ({ one }) => ({
    user: one(user, {
      fields: [userGithubConnection.userId],
      references: [user.id],
    }),
  }),
);
