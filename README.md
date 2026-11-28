# Check My Solar Modbus Bridge

Local Docker stack for **Fox ESS** inverters (H1, H3, KH, and OEM variants). Polls live data over Modbus TCP and sends snapshots to Check My Solar through a private tunnel.

The bridge **auto-detects** your inverter model.

**Full guide:** [checkmy.solar/docs/using-the-app/modbus-bridge/](https://checkmy.solar/docs/using-the-app/modbus-bridge/)

## Supported inverters

Register profiles (auto-detected from the model string):

| Profile | Example models |
|---------|----------------|
| `h1g2` | H1-G2, AC1-G2, P1 |
| `h1Series` | H1, AC1, AIO-H1 (G1 / LAN) |
| `kh` | KH10.5, KH-5.0 |
| `h3Legacy` | H3, AC3, AIO-H3, Kuara, SK-HWR, STAR, Solavita SP, a-TroniX AX |
| `h3Modern` | H3-Pro, H3-Smart, P3-SH, Enpal I-X, 1KOMMA5, EVO |

Override auto-detect with `INVERTER_PROFILE` if needed.

## Quick start

Create a token in **Menu → Account → Modbus Bridge**, then on your home server:

```bash
export CMS_BRIDGE_TOKEN='cms_bridge_...'          # from the app
export MODBUS_HOST='192.168.1.100'              # Modbus adapter IP
export BRIDGE_HOSTNAME='bridge-....modbus.internal'  # from the app
export TUNNEL_TOKEN='eyJ...'                       # from the app
export SITE_TIMEZONE='Europe/London'              # IANA timezone for hour buckets
# export MODBUS_CONNECTION=aux                      # default; use lan for direct inverter LAN
# export INVERTER_PROFILE=h3Modern                  # optional override
# export BRIDGE_VERBOSE_LOG=true                    # log each Modbus poll and HTTP request
# export MODBUS_DEBUG_LOG=true                      # log low-level Modbus reads (batching, retries, blacklisting)
docker compose up -d
```

## Home Assistant

On **Home Assistant OS**, you can install this bridge as a Supervisor app (Modbus bridge and Cloudflare tunnel in one container). Add the repository, install **Check My Solar Modbus Bridge**, and paste the tokens from Check My Solar into the app configuration.

[![Open your Home Assistant instance and show the add app repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fcheckmysolar%2Fmodbus-bridge)

Setup and options: [homeassistant/checkmysolar_modbus_bridge/DOCS.md](homeassistant/checkmysolar_modbus_bridge/DOCS.md).

When cutting a release, bump `version` in `homeassistant/checkmysolar_modbus_bridge/config.yaml` so it matches the Git tag (e.g. `v2.0.2`). The workflow publishes `ghcr.io/checkmysolar/modbus-bridge-homeassistant` with the same tag.

## Test inverter connectivity

Confirm Modbus works from your LAN before setting up tokens or Docker:

```bash
npm install
npm run build
MODBUS_HOST=192.168.1.100 npm run probe
```

**From Docker** (the runtime image has no shell or npm — invoke Node directly):

```bash
docker run --rm -e MODBUS_HOST=192.168.1.100 ghcr.io/checkmysolar/modbus-bridge:latest dist/probe.js
```

If the stack is already running, probe inside the `modbus` container:

```bash
docker compose exec modbus dist/probe.js
```

## Security

The production image uses a **distroless** runtime (no shell, no package manager) and runs as a non-root user. The `docker-compose.yml` stack is hardened with a read-only root filesystem, dropped Linux capabilities, and `no-new-privileges`. Port **8080 is not published** to the host — only `cloudflared` on the internal Docker network reaches the bridge.

## Development

```bash
npm install
npm test
npm run build
```

## Acknowledgements

The Modbus register maps and inverter logic in this bridge are adapted from **[foxess_modbus](https://github.com/nathanmarlor/foxess_modbus)** - a community Home Assistant integration. Thanks to [Nathan Marlor](https://github.com/nathanmarlor) and everyone who contributes to that project.
