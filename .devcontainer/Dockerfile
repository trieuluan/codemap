FROM node:24-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends bubblewrap bash git openssh-client ca-certificates curl sqlite3 \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable pnpm

WORKDIR /workspace

RUN mkdir -p /workspace/node_modules && chown -R node:node /workspace

USER node
