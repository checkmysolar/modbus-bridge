# Check My Solar Modbus Bridge

Local Docker stack for **Fox ESS H1 G2** inverters. Polls live data over Modbus TCP and sends snapshots to Check My Solar through a private tunnel.

**Full guide:** [checkmy.solar/docs/using-the-app/modbus-bridge/](https://checkmy.solar/docs/using-the-app/modbus-bridge/)

## Quick start

Create a token in **Menu → Account → Modbus Bridge**, then on your home server:

```bash
export CMS_BRIDGE_TOKEN='cms_bridge_...'          # from the app
export MODBUS_HOST='192.168.1.100'              # Modbus adapter IP
export BRIDGE_HOSTNAME='bridge-....modbus.internal'  # from the app
export TUNNEL_TOKEN='eyJ...'                       # from the app
# export BRIDGE_VERBOSE_LOG=true                    # log each Modbus poll and /v1/realtime request
docker compose up -d
```

## Test inverter connectivity (before Docker)

Confirm Modbus works from your LAN before setting up tokens or Docker:

```bash
npm install
MODBUS_HOST=192.168.1.100 npm run probe
```

## Development

```bash
npm install
npm test
npm run build
```
