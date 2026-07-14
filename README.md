# Check My Solar Modbus Bridge

Optional local software for **Fox ESS H1 G2** inverters. It reads live power, battery, and grid data directly from your inverter over **Modbus TCP**, then sends a snapshot to Check My Solar through a secure private tunnel.

By default, Check My Solar uses **Fox Cloud**, the same path as the Fox ESS app. That works well, but Fox Cloud updates every few minutes. When this bridge is running, the **Today** dashboard can refresh live numbers about every **10 seconds**.

You do **not** need the bridge for normal use. Linking Fox Cloud is enough for charts, history, forecasts, and notifications.

**Full guide:** [Modbus Bridge on checkmy.solar](https://checkmy.solar/using-the-app/modbus-bridge/)

---

## When to use it

The Modbus Bridge is a good fit if you:

- Have a **Fox ESS H1 G2** with **Modbus TCP** enabled (usually via an RS485-to-Ethernet adapter on your home network)
- Run a home server, NAS, Raspberry Pi, or other always-on machine with **Docker**
- Want **faster live updates** on the Today view

---

## What you need

1. **Fox ESS H1 G2** inverter with Modbus TCP on your LAN  
   - Typical defaults: port **502**, unit ID **247**
2. **Check My Solar account** with the inverter already linked via Fox Cloud
3. **Docker** on a machine on the same network as the inverter
4. Network access from that machine to your Modbus adapter’s IP address

---

## Setup

### 1. Create a bridge token in the app

1. Open **Menu → Account**
2. Tap **Modbus Bridge** (under Advanced)
3. Select the correct **inverter** on the dashboard first. Each account can have **one active bridge**, tied to one device
4. Tap **Create token** and copy the secrets shown **immediately**. They are only displayed once

Check My Solar provisions the **Cloudflare Tunnel** and **private hostname** for you. You do not need to create tunnel resources yourself.

The app shows:

- **Bridge token**: authenticates the local bridge (`CMS_BRIDGE_TOKEN`)
- **Tunnel run token**: starts the secure tunnel (`TUNNEL_TOKEN`)
- **Private hostname**: must match your bridge config (`BRIDGE_HOSTNAME`)
- A ready-to-run **docker compose** command

### 2. Run Docker at home

On your home server:

```bash
git clone https://github.com/checkmysolar/modbus-bridge.git
cd modbus-bridge
export CMS_BRIDGE_TOKEN='cms_bridge_...'          # from the app
export MODBUS_HOST='192.168.1.100'              # your Modbus adapter IP
export BRIDGE_HOSTNAME='bridge-....modbus.internal'  # from the app
export TUNNEL_TOKEN='eyJ...'                       # from the app
docker compose up -d
```

This starts two containers:

- **modbus**: polls your inverter and keeps the latest reading locally
- **cloudflared**: connects the bridge to Check My Solar over an encrypted outbound tunnel

No inbound ports need to be opened on your router. Traffic flows **outbound** from your home network through the tunnel.

Replace `192.168.1.100` with the IP address of your Modbus adapter (the device between your inverter and your LAN).

### 3. Confirm it is working

Reopen **Modbus Bridge** in Account settings. The status banner should show:

| Status | Meaning |
|--------|---------|
| **Online** | Bridge is reachable and data was sampled within the last 60 seconds |
| **Stale** | Bridge was reachable but the last sample is older than 60 seconds |
| **Waiting** | Token exists but Check My Solar has not received data from the bridge yet |

On the **Today** dashboard, live numbers should update about every 10 seconds while the bridge is online.

---

## Test inverter connectivity (before Docker)

You can confirm Modbus works from your home network **before** setting up tokens or Docker. No Check My Solar account is required for this step.

```bash
git clone https://github.com/checkmysolar/modbus-bridge.git
cd modbus-bridge
npm install
MODBUS_HOST=192.168.1.100 npm run probe
```

Successful output looks like:

```
Connecting to 192.168.1.100:502 (unit 247, timeout 5000ms)...
TCP connected
Realtime snapshot:
  loadsPower=0.607 kW
  pvPower=4.529 kW (pv1=2.124, pv2=2.405)
  SoC=100%  ResidualEnergy=9.89 kWh
  feedin=3.937 kW  gridConsumption=0.000 kW
  batCharge=0.000 kW  batDischarge=0.015 kW
OK: inverter Modbus connectivity works
```

Values reflect live inverter state at probe time. If it fails, check LAN reachability, the adapter IP, port 502, unit ID 247, and that Modbus is enabled on the adapter.

---

## Optional settings

Most users only need the four variables above. You can also tune:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MODBUS_PORT` | `502` | Modbus TCP port |
| `MODBUS_UNIT_ID` | `247` | Fox ESS Modbus unit ID |
| `POLL_INTERVAL_MS` | `10000` | How often to poll the inverter (10 seconds) |
| `MODBUS_TIMEOUT_MS` | `5000` | Modbus request timeout |
| `BRIDGE_HTTP_PORT` | `8080` | Local HTTP port inside the container |

---

## What the bridge provides

When online, Check My Solar **prefers bridge readings** for live fields on the Today view: PV power, battery state of charge, grid import/export, house load, temperatures, and off-grid/EPS status where available.

**Still from Fox Cloud** (unchanged):

- Historical charts (week, month, year)
- Daily totals and reports
- Device settings, scheduler, and work mode
- Forecasts and notifications

If the bridge goes offline or data goes stale, the app falls back to Fox Cloud automatically.

**Not available over H1 G2 Modbus:** per-string data beyond PV1/PV2, boost/charge/DSP temperatures, fault codes, 3-phase EPS (S/T), and some battery-health fields that only Fox Cloud exposes.

---

## Security

- The bridge token is a **secret**. Treat it like a password and store it only on your home server.
- Your inverter is **not** exposed to the internet. Only the bridge container talks to it on your LAN.
- Check My Solar reaches your bridge over a **private tunnel hostname**, not a public URL on your home IP.
- Tunnel traffic is encrypted with **TLS 1.3** (including post-quantum key agreement between your `cloudflared` container and Cloudflare).
- **Revoking** a token in the app tears down the tunnel and invalidates access.

---

## Troubleshooting

| Symptom | Things to check |
|---------|-----------------|
| **Waiting** never clears | Are both Docker containers running? Is `MODBUS_HOST` correct? Can the Docker host reach the adapter? |
| **Stale** data | Is the inverter online? Check bridge logs: `docker compose logs modbus` |
| No **Modbus Bridge** menu item | The feature may not be enabled for your account yet. Contact [support](https://checkmy.solar/reference/support/) |
| Bridge on wrong device | Only one active token per account. Revoke the old one before creating for another inverter |
| Reinstalled Docker | Create a new tunnel run token from **Menu → Account → Modbus Bridge** in the app |

Local health check on the Docker host:

```bash
docker compose exec modbus wget -qO- http://127.0.0.1:8080/v1/health
```

For Modbus-only testing (no cloud setup), use `npm run probe` as described above.

---

## Managing tokens

From **Menu → Account → Modbus Bridge** you can:

- **Create** a token for the selected inverter
- **Revoke** a token: disconnects the tunnel and stops bridge access
- Check **bridge status** and last sample time

If you reinstall Docker later, you can fetch a fresh tunnel run token from the same screen without recreating the bridge token.

---

## Related

- [Modbus Bridge guide](https://checkmy.solar/using-the-app/modbus-bridge/): architecture, security, and dashboard behaviour
- [Dashboard overview](https://checkmy.solar/using-the-app/dashboard-overview/)
- [Account & settings](https://checkmy.solar/using-the-app/account-settings/)
- [Support](https://checkmy.solar/reference/support/)
