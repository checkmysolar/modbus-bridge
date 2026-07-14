FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY packages/modbus-telemetry /packages/modbus-telemetry
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

ENV BRIDGE_DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8080

CMD ["npm", "start"]
