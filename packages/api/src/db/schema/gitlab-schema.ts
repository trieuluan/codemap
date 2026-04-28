import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const userGitlabConnection = pgTable(
  "user_gitlab_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    gitlabUserId: integer("gitlab_user_id").notNull(),
    gitlabLogin: text("gitlab_login").notNull(),
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
    index("user_gitlab_connection_userId_idx").on(table.userId),
    index("user_gitlab_connection_gitlabUserId_idx").on(table.gitlabUserId),
  ],
);

export const userGitlabConnectionRelations = relations(
  userGitlabConnection,
  ({ one }) => ({
    user: one(user, {
      fields: [userGitlabConnection.userId],
      references: [user.id],
    }),
  }),
);
