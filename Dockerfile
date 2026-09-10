# Build native modules (better-sqlite3) against glibc, then ship a distroless runtime
# with no shell or package manager to minimise post-exploitation options.
ARG NODE_IMAGE=node:24.19.0-trixie-slim@sha256:0711b541c1c33a8a530ac4f0d391baa9a15b3d804695b1b24a47daa5fb60e74d
ARG RUNNER_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:fbbdda866ea71aef98c4abece17e3d61fbf820cc2ef3961522caa2478716171a
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# Debian 13 (trixie) package versions for the node-gyp toolchain.
ARG PYTHON3_VERSION=3.13.5-1
ARG MAKE_VERSION=4.4.1-2
ARG GPP_VERSION=4:14.2.0-1
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3=${PYTHON3_VERSION} \
    make=${MAKE_VERSION} \
    g++=${GPP_VERSION} \
  && rm -rf /var/lib/apt/lists/*

COPY packages/modbus-telemetry ./packages/modbus-telemetry
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM ${RUNNER_IMAGE} AS runner
WORKDIR /app

ARG BRIDGE_VERSION=dev
ENV BRIDGE_VERSION=$BRIDGE_VERSION
ENV NODE_ENV=production
ENV BRIDGE_DATA_DIR=/data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/modbus-telemetry ./packages/modbus-telemetry

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8080/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["dist/index.js"]
