import fp from "fastify-plugin";
import IORedis from "ioredis";

export default fp(async (fastify) => {
  const redis = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  fastify.decorate("redis", redis);
  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
});
