import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { db, sql } from '../db'

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('db', db)

  fastify.addHook('onClose', async () => {
    await sql.end()
  })
}

export default fp(dbPlugin, {
  name: 'db',
})