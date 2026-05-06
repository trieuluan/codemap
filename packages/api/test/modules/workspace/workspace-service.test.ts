import * as assert from "node:assert";
import { test } from "node:test";
import {
  assertCanCreateProject,
  assertCanTriggerImport,
  assertCanUseMcp,
  assertCanUsePrivateRepo,
  createWorkspaceService,
  getWorkspaceEntitlements,
} from "../../../src/modules/workspace/service";

const ownerMembership = {
  workspaceId: "workspace-1",
  userId: "owner-1",
  role: "owner",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const memberMembership = {
  ...ownerMembership,
  role: "member",
};

function workspace(plan: "basic" | "beta" | "developer" | "team") {
  return {
    id: "workspace-1",
    name: "Workspace",
    slug: "workspace",
    type: "team",
    ownerUserId: "owner-1",
    plan,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createInviteDb(options: {
  plan: "basic" | "beta" | "developer" | "team";
  membershipRole?: "owner" | "admin" | "member";
  inviteeExists?: boolean;
  alreadyMember?: boolean;
}) {
  const membership =
    options.membershipRole === "member" ? memberMembership : ownerMembership;
  let workspaceMemberLookups = 0;

  return {
    query: {
      workspaceMember: {
        findFirst: async () => {
          workspaceMemberLookups += 1;
          if (workspaceMemberLookups === 1) return membership;
          return options.alreadyMember ? { ...memberMembership, userId: "invitee-1" } : null;
        },
      },
      workspace: {
        findFirst: async () => workspace(options.plan),
      },
      user: {
        findFirst: async () =>
          options.inviteeExists === false
            ? null
            : {
                id: "invitee-1",
                name: "Invitee",
                email: "invitee@example.com",
              },
      },
    },
    insert: () => ({
      values: () => ({
        returning: async () => [
          {
            workspaceId: "workspace-1",
            userId: "invitee-1",
            role: "member",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    }),
  };
}

test("workspace entitlements encode plan limits", () => {
  const basic = getWorkspaceEntitlements({ plan: "basic" });
  assert.equal(basic.maxProjects, 5);
  assert.equal(basic.maxImportsPerMonth, 0);
  assert.equal(basic.privateRepoImports, false);
  assert.equal(basic.teamMembers, false);
  assert.equal(basic.mcpAccess, true);
  assert.equal(basic.cloudImportAccess, false);

  const beta = getWorkspaceEntitlements({ plan: "beta" });
  assert.equal(beta.maxProjects, null);
  assert.equal(beta.teamMembers, false);
  assert.equal(beta.mcpAccess, true);
  assert.equal(beta.cloudImportAccess, true);

  const developer = getWorkspaceEntitlements({ plan: "developer" });
  assert.equal(developer.maxProjects, 20);
  assert.equal(developer.maxImportsPerMonth, 200);
  assert.equal(developer.privateRepoImports, true);
  assert.equal(developer.teamMembers, false);
  assert.equal(developer.cloudImportAccess, true);

  const team = getWorkspaceEntitlements({ plan: "team" });
  assert.equal(team.maxProjects, null);
  assert.equal(team.maxImportsPerMonth, null);
  assert.equal(team.teamMembers, true);
  assert.equal(team.cloudImportAccess, true);
});

test("workspace limit assertions throw stable entitlement errors", () => {
  assert.throws(
    () =>
      assertCanCreateProject(
        { ...getWorkspaceEntitlements({ plan: "developer" }), maxProjects: 1 },
        {
          projectCount: 1,
          importsThisMonth: 0,
          indexedFilesThisMonth: 0,
          indexedSymbolsThisMonth: 0,
          indexedEdgesThisMonth: 0,
          mcpSessionsCreatedThisMonth: 0,
        },
      ),
    /WORKSPACE_PROJECT_LIMIT_EXCEEDED/,
  );

  assert.throws(
    () =>
      assertCanTriggerImport(getWorkspaceEntitlements({ plan: "basic" }), {
        projectCount: 0,
        importsThisMonth: 0,
        indexedFilesThisMonth: 0,
        indexedSymbolsThisMonth: 0,
        indexedEdgesThisMonth: 0,
        mcpSessionsCreatedThisMonth: 0,
      }),
    /WORKSPACE_CLOUD_IMPORT_NOT_AVAILABLE/,
  );

  assert.throws(
    () =>
      assertCanTriggerImport(
        {
          ...getWorkspaceEntitlements({ plan: "developer" }),
          maxImportsPerMonth: 1,
        },
        {
          projectCount: 0,
          importsThisMonth: 1,
          indexedFilesThisMonth: 0,
          indexedSymbolsThisMonth: 0,
          indexedEdgesThisMonth: 0,
          mcpSessionsCreatedThisMonth: 0,
        },
      ),
    /WORKSPACE_IMPORT_LIMIT_EXCEEDED/,
  );

  assert.throws(
    () => assertCanUseMcp({ ...getWorkspaceEntitlements({ plan: "team" }), mcpAccess: false }),
    /WORKSPACE_MCP_ACCESS_DISABLED/,
  );
  assert.throws(
    () =>
      assertCanUsePrivateRepo({
        ...getWorkspaceEntitlements({ plan: "team" }),
        privateRepoImports: false,
      }),
    /WORKSPACE_PRIVATE_REPO_IMPORT_DISABLED/,
  );
});

test("workspace invite requires manager role and team member entitlement", async () => {
  const memberService = createWorkspaceService(
    createInviteDb({ plan: "team", membershipRole: "member" }) as never,
  );
  await assert.rejects(
    () => memberService.inviteMember("owner-1", "workspace-1", "invitee@example.com"),
    /WORKSPACE_ROLE_REQUIRED/,
  );

  const developerService = createWorkspaceService(
    createInviteDb({ plan: "developer" }) as never,
  );
  await assert.rejects(
    () => developerService.inviteMember("owner-1", "workspace-1", "invitee@example.com"),
    /WORKSPACE_TEAM_MEMBERS_DISABLED/,
  );
});

test("workspace invite adds an existing account on team plan", async () => {
  const service = createWorkspaceService(createInviteDb({ plan: "team" }) as never);
  const result = await service.inviteMember(
    "owner-1",
    "workspace-1",
    "Invitee@Example.com",
  );

  assert.equal(result?.user.email, "invitee@example.com");
  assert.equal(result?.member.userId, "invitee-1");
  assert.equal(result?.member.role, "member");
});

test("workspace invite handles missing or existing invitees", async () => {
  const missingUserService = createWorkspaceService(
    createInviteDb({ plan: "team", inviteeExists: false }) as never,
  );
  await assert.rejects(
    () => missingUserService.inviteMember("owner-1", "workspace-1", "missing@example.com"),
    /USER_NOT_FOUND/,
  );

  const existingMemberService = createWorkspaceService(
    createInviteDb({ plan: "team", alreadyMember: true }) as never,
  );
  await assert.rejects(
    () => existingMemberService.inviteMember("owner-1", "workspace-1", "invitee@example.com"),
    /ALREADY_MEMBER/,
  );
});
