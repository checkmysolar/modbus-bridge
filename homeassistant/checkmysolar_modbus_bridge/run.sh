#!/command/with-contenv bashio
# shellcheck shell=bash
set -e

export NODE_ENV=production
export BRIDGE_DATA_DIR=/data

export CMS_BRIDGE_TOKEN="$(bashio::config 'cms_bridge_token')"
export TUNNEL_TOKEN="$(bashio::config 'tunnel_token')"
export MODBUS_HOST="$(bashio::config 'modbus_host')"
site_timezone="$(bashio::config 'site_timezone')"
if [[ -z "${site_timezone}" ]]; then
  site_timezone="${TZ:-UTC}"
fi
export SITE_TIMEZONE="${site_timezone}"
export MODBUS_PORT="$(bashio::config 'modbus_port')"
export MODBUS_UNIT_ID="$(bashio::config 'modbus_unit_id')"
export POLL_INTERVAL_MS="$(bashio::config 'poll_interval_ms')"
export MODBUS_TIMEOUT_MS="$(bashio::config 'modbus_timeout_ms')"
export MODBUS_CONNECTION="$(bashio::config 'modbus_connection')"

if bashio::config.has_value 'inverter_profile'; then
  export INVERTER_PROFILE="$(bashio::config 'inverter_profile')"
fi

if bashio::config.has_value 'cms_api_base_url'; then
  export CMS_API_BASE_URL="$(bashio::config 'cms_api_base_url')"
fi

if bashio::config.true 'modbus_read_only'; then
  export MODBUS_READ_ONLY=true
else
  export MODBUS_READ_ONLY=false
fi

if bashio::config.true 'cms_notifications_enabled'; then
  export CMS_NOTIFICATIONS_ENABLED=true
else
  export CMS_NOTIFICATIONS_ENABLED=false
fi

if bashio::config.true 'bridge_verbose_log'; then
  export BRIDGE_VERBOSE_LOG=true
else
  export BRIDGE_VERBOSE_LOG=false
fi

if bashio::config.true 'modbus_debug_log'; then
  export MODBUS_DEBUG_LOG=true
else
  export MODBUS_DEBUG_LOG=false
fi

bridge_hostname="$(bashio::config 'bridge_hostname')"
export BRIDGE_HOSTNAME="${bridge_hostname}"
echo "127.0.0.1 ${bridge_hostname}" >> /etc/hosts

bashio::log.info "Starting cloudflared tunnel"
cloudflared tunnel --metrics 127.0.0.1:60123 --no-autoupdate run --token "${TUNNEL_TOKEN}" &
cloudflared_pid=$!

cleanup() {
  if [[ -n "${cloudflared_pid}" ]]; then
    kill "${cloudflared_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

bashio::log.info "Starting Modbus bridge (Modbus host ${MODBUS_HOST})"
exec node /app/dist/index.js