import fp from 'fastify-plugin'
import { parseEnv } from '../config/env'
import { FastifyInstance } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
  const config = parseEnv(process.env)
  // Make decoration idempotent so plugin registration order doesn't break runtime.
  if (!fastify.hasDecorator('config')) {
    fastify.decorate('config', config)
  }
  fastify.log.info(
    { config },
    'Environment variables loaded'
  )
})