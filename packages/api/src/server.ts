import Fastify from "fastify";
import app, { options } from "./app";

const start = async () => {
  const fastify = Fastify(options);

  await fastify.register(app);

  const port = Number(process.env.API_PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`Server listening at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

void start();
