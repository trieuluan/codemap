# CodeMap Docker deploy

## Recommended production flow

Use Docker only as the packaging/runtime layer, and deploy by pulling a prebuilt image.

### 1) Build and push image in CI

Example:

```bash
docker build -t ghcr.io/your-org/codemap-api:${GIT_SHA} .
docker push ghcr.io/your-org/codemap-api:${GIT_SHA}
docker tag ghcr.io/your-org/codemap-api:${GIT_SHA} ghcr.io/your-org/codemap-api:latest
docker push ghcr.io/your-org/codemap-api:latest
```

### 2) Server only pulls and restarts

```bash
docker login ghcr.io
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Good production patterns

- Build image in CI, not on the server.
- Push to a registry such as GHCR, Docker Hub, or GitLab Container Registry.
- Keep `.env` only on the server.
- Use a reverse proxy in front of the app (Nginx, Traefik, or Caddy).
- Run database migrations as a separate step before or right after deploy.
- Tag images with both immutable tags (`git sha`) and a moving tag (`latest` or `main`).
- Prefer managed Postgres/Redis in production if possible.

## Notes for this Fastify project

This template assumes:

- `npm run build` outputs to `dist`
- app entrypoint is `dist/app.js`
- `package-lock.json` is used

Adjust these if your actual scripts differ.
