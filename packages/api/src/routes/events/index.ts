import type { FastifyInstance, FastifyRequest } from "fastify";
import type IORedis from "ioredis";
import { z } from "zod";
import { getProjectImportQueue } from "../../lib/project-import-queue.js";
import { getProjectParseQueue } from "../../lib/project-parse-queue.js";
import { createProjectService } from "../../modules/project/service.js";
import { createWorkspaceService } from "../../modules/workspace/service.js";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

function send(res: NodeJS.WritableStream, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function eventsRoutes(fastify: FastifyInstance) {
  const fastifyWithRedis = fastify as FastifyInstance & { redis: IORedis };

  // ── GET /events/projects/:projectId/import ─────────────────────────────────
  // Streams import + parse progress. Poll every 2s, closes when done.
  fastify.get("/projects/:projectId/import", async (request, reply) => {
    const userId = (
      request as FastifyRequest & {
        session: { user?: { id: string } } | null;
      }
    ).session?.user?.id;
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const { projectId } = z
      .object({ projectId: z.uuid() })
      .parse(request.params);
    const projectService = createProjectService(fastify.db);

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) return reply.code(404).send({ error: "NOT_FOUND" });

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, SSE_HEADERS);
    res.write(": ok\n\n");

    const importQueue = getProjectImportQueue(fastifyWithRedis.redis);
    const parseQueue = getProjectParseQueue(fastifyWithRedis.redis);
    let lastPayload = "";

    const poll = async () => {
      try {
        const latestImport = await projectService.getLatestImport(projectId);
        if (!latestImport) return;

        let importProgress: number | null = null;
        let importStage: string | null = null;
        let parseProgress: number | null = null;
        let parseStage: string | null = null;

        if (latestImport.status === "running") {
          const job = await importQueue.getJob(latestImport.id);
          const p = job?.progress as
            | { progress?: number; stage?: string }
            | number
            | null
            | undefined;
          if (p && typeof p === "object") {
            importProgress = p.progress ?? null;
            importStage = p.stage ?? null;
          }
        }

        if (latestImport.parseStatus === "running") {
          const job = await parseQueue.getJob(latestImport.id);
          const p = job?.progress as
            | { progress?: number; stage?: string }
            | number
            | null
            | undefined;
          if (p && typeof p === "object") {
            parseProgress = p.progress ?? null;
            parseStage = p.stage ?? null;
          }
        }

        const payload = {
          importId: latestImport.id,
          status: latestImport.status,
          parseStatus: latestImport.parseStatus,
          importProgress,
          importStage,
          parseProgress,
          parseStage,
        };

        const str = JSON.stringify(payload);
        if (str !== lastPayload) {
          lastPayload = str;
          send(res, payload);
        }

        const done =
          latestImport.status === "failed" ||
          (latestImport.status === "completed" &&
            ["completed", "partial", "failed"].includes(
              latestImport.parseStatus ?? "",
            ));

        if (done) {
          clearInterval(timer);
          res.end();
        }
      } catch {
        // ignore transient errors
      }
    };

    const timer = setInterval(() => void poll(), 2000);
    void poll();
    request.raw.on("close", () => clearInterval(timer));
  });

  // ── GET /events/workspaces/:workspaceId/subscription ───────────────────────
  // Streams plan changes after PayPal approval. Closes when plan changes or 60s timeout.
  fastify.get(
    "/workspaces/:workspaceId/subscription",
    async (request, reply) => {
      const userId = (
        request as FastifyRequest & {
          session: { user?: { id: string } } | null;
        }
      ).session?.user?.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const { workspaceId } = z
        .object({ workspaceId: z.uuid() })
        .parse(request.params);
      const workspaceService = createWorkspaceService(fastify.db);

      const access = await workspaceService.getWorkspaceAccess(
        userId,
        workspaceId,
      );
      if (!access) return reply.code(404).send({ error: "NOT_FOUND" });

      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, SSE_HEADERS);
      res.write(": ok\n\n");

      let lastPlan = access.workspace.plan;

      const timeout = setTimeout(() => {
        clearInterval(timer);
        send(res, { type: "timeout" });
        res.end();
      }, 60_000);

      const poll = async () => {
        try {
          const detail = await workspaceService.getWorkspaceAccess(
            userId,
            workspaceId,
          );
          if (!detail) return;

          const plan = detail.workspace.plan;
          if (plan !== lastPlan) {
            lastPlan = plan;
            clearTimeout(timeout);
            clearInterval(timer);
            send(res, { type: "plan_changed", plan });
            res.end();
          }
        } catch {
          // ignore transient errors
        }
      };

      const timer = setInterval(() => void poll(), 2000);
      request.raw.on("close", () => {
        clearTimeout(timeout);
        clearInterval(timer);
      });
    },
  );
}
