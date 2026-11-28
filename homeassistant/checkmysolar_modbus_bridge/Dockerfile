# https://contributors.home-assistant.io/apps/guides/dockerfile/
ARG BUILD_FROM=ghcr.io/home-assistant/base:3.24
ARG BUILD_VERSION=latest
ARG CLOUDFLARED_VERSION=2026.11.2

FROM ghcr.io/checkmysolar/modbus-bridge:${BUILD_VERSION} AS bridge

FROM ${BUILD_FROM}

ARG BUILD_VERSION
ARG BUILD_ARCH
ARG CLOUDFLARED_VERSION
ARG TARGETARCH

RUN \
  if [ -z "${TARGETARCH}" ]; then \
    echo "TARGETARCH is not set; use Docker BuildKit." && exit 1; \
  fi \
  && case "${TARGETARCH}" in \
    amd64) cf_arch="amd64" ;; \
    arm64) cf_arch="arm64" ;; \
    *) echo "Unsupported TARGETARCH: ${TARGETARCH}" && exit 1 ;; \
  esac \
  && curl -fsSL -o /usr/bin/cloudflared \
    "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${cf_arch}" \
  && chmod +x /usr/bin/cloudflared \
  && apk add --no-cache nodejs=~24

COPY --from=bridge /app /app

COPY run.sh /
RUN chmod a+x /run.sh

ENV BRIDGE_DATA_DIR=/data
ENV BRIDGE_VERSION=${BUILD_VERSION}
ENV NODE_ENV=production

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.type="app" \
  org.opencontainers.image.title="Home Assistant App: Check My Solar Modbus Bridge" \
  org.opencontainers.image.description="Fox ESS Modbus bridge for Check My Solar" \
  org.opencontainers.image.source="https://github.com/checkmysolar/modbus-bridge"

CMD [ "/run.sh" ]