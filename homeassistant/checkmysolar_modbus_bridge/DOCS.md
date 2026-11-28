# Check My Solar Modbus Bridge on Home Assistant

This app runs the Modbus bridge and Cloudflare tunnel in a **single container** on Home Assistant OS. It does not expose port 8080 on your LAN; Check My Solar reaches the bridge through the private tunnel only.

## Before you start

1. Use **Home Assistant OS** (Supervisor apps are not available on Container-only installs).
2. In [Check My Solar](https://checkmy.solar), open **Menu → Account → Modbus Bridge** and create a bridge. Note:
   - **Bridge token** (`cms_bridge_…`)
   - **Tunnel token** (`eyJ…`)
   - **Bridge hostname** (`bridge-….modbus.internal`)
3. Know the **Modbus TCP IP** on your LAN (inverter or RS485 adapter — not the Fox Cloud serial).

See also: [Modbus bridge guide](https://checkmy.solar/docs/using-the-app/modbus-bridge/).

## Add the repository

1. Go to **Settings → Apps → App store** (top right menu → **Repositories**).
2. Add:

   `https://github.com/checkmysolar/modbus-bridge`

3. **Check for updates** and open the **Check My Solar** repository section.

## Install and configure

1. Install **Check My Solar Modbus Bridge**.
2. Open the **Configuration** tab and fill in required fields (see translations on each field).
3. For secrets, you can use Home Assistant `secrets.yaml`, e.g. `cms_bridge_token: !secret cms_bridge_token` in the app configuration UI where supported.
4. **Start** the app and open **Log**. You should see the bridge version, then Modbus poll activity (enable **Verbose bridge logging** temporarily if needed).

## Options reference

| Option | Purpose |
|--------|---------|
| Bridge token / tunnel token | Credentials from Check My Solar |
| Modbus host | LAN IP for Modbus TCP |
| Bridge hostname | Value from Check My Solar (tunnel origin) |
| Site timezone | IANA name for hourly buckets |
| Connection type | `aux` (RS485 adapter) or `lan` (inverter Ethernet) |
| Inverter profile | Empty = auto-detect; otherwise force a Fox map |
| Read-only Modbus | Default on; turn off only if CMS writes are required |

## Health and storage

- The Supervisor health check calls `GET /v1/health` inside the container.
- SQLite and bridge state live under `/data` (included in app backups).

## Troubleshooting

### Cannot reach the inverter

- Confirm the IP with a Modbus client or the standalone probe from the main [README](https://github.com/checkmysolar/modbus-bridge#test-inverter-connectivity) on another machine first.
- If the inverter is on a different VLAN, try enabling **Host network** for this app (Settings → Apps → your app → Network) only if default routing fails.

### Tunnel or auth errors

- Re-copy tokens from Check My Solar; expired tunnel tokens must be reissued.
- Ensure **bridge hostname** matches the value shown in the app setup flow.

### Updates

Releases publish matching tags for `ghcr.io/checkmysolar/modbus-bridge-homeassistant`. **Check for updates** in the app store after a new GitHub release.

## Support

- Issues: [github.com/checkmysolar/modbus-bridge/issues](https://github.com/checkmysolar/modbus-bridge/issues)
- Product help: Check My Solar documentation and in-app support