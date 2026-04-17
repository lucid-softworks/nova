# Single image serves both the web process (`pnpm start`) and the
# standalone worker (`pnpm worker`). Orchestrator picks the command.
#
# Build:
#   docker build -t nova:latest .
# Run web:
#   docker run --env-file .env -p 3000:3000 nova:latest
# Run worker (any number of replicas):
#   docker run --env-file .env -e DISABLE_INLINE_WORKER=1 nova:latest pnpm worker

FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@10.12.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@10.12.2 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.12.2 --activate
WORKDIR /app

# Runtime only needs prod deps + the built output + the TS worker entry
# (tsx compiles it on-demand).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/app ./app
COPY server-entry.js ./server-entry.js

# Non-root by default.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin nova \
    && chown -R nova:nova /app
USER nova

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
