FROM node:24-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash git openssh-client ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

RUN mkdir -p /workspace/node_modules && chown -R node:node /workspace

USER node
