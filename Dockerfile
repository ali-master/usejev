# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.4.2
FROM oven/bun:${BUN_VERSION}-slim AS base
WORKDIR /app

FROM base AS dependencies
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY playground/package.json playground/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
COPY apps/server/src apps/server/src
COPY packages/runtime/src packages/runtime/src
COPY playground playground
COPY scripts/docker scripts/docker
RUN bun build --target=bun --minify --external=onnxruntime-node \
      --outdir=/out/server apps/server/src/index.ts \
    && bun build --target=bun --production --minify \
      --outdir=/out/playground playground/server.ts \
    && bun scripts/docker/copy-native.ts

# The playground has no native inference dependency or node_modules at runtime.
FROM base AS playground
ENV NODE_ENV=production PLAYGROUND_HOST=0.0.0.0 PLAYGROUND_PORT=3001
COPY --from=build --chown=bun:bun /out/playground/ ./
USER bun
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD bun -e 'const r = await fetch(`http://127.0.0.1:${process.env.PLAYGROUND_PORT}/api/health`); const b = await r.json(); process.exit(r.ok && b.status === "ready" ? 0 : 1)'
CMD ["bun", "server.js"]

# glibc is required by the prebuilt ONNX binding; Alpine/musl is not used.
FROM base AS server
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 LAYA_MODEL_DIR=/models
COPY --from=build --chown=bun:bun /out/server/ ./
COPY --from=build --chown=bun:bun /out/native/node_modules/ ./node_modules/
COPY licenses/ ./licenses/
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD bun -e 'const r = await fetch(`http://127.0.0.1:${process.env.PORT}/health`); const b = await r.json(); process.exit(r.ok && b.status === "ready" ? 0 : 1)'
CMD ["bun", "index.js"]
