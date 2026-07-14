FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY packages/modbus-telemetry ./packages/modbus-telemetry
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV BRIDGE_DATA_DIR=/data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY packages/modbus-telemetry ./packages/modbus-telemetry

VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "dist/index.js"]
