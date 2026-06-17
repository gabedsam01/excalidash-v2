#!/bin/sh
# Alpine-based image uses /bin/sh (busybox ash), not bash
set -e

if [ "${BACKEND_URL+x}" = "x" ] && [ -z "${BACKEND_URL}" ]; then
    echo "ERROR: BACKEND_URL must not be empty" >&2
    exit 1
fi

BACKEND_URL="${BACKEND_URL:-backend:8000}"
NGINX_CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-250M}"
NGINX_PROXY_CONNECT_TIMEOUT="${NGINX_PROXY_CONNECT_TIMEOUT:-300s}"
NGINX_PROXY_SEND_TIMEOUT="${NGINX_PROXY_SEND_TIMEOUT:-300s}"
NGINX_PROXY_READ_TIMEOUT="${NGINX_PROXY_READ_TIMEOUT:-300s}"
NGINX_WEBSOCKET_READ_TIMEOUT="${NGINX_WEBSOCKET_READ_TIMEOUT:-3600s}"
NGINX_WEBSOCKET_SEND_TIMEOUT="${NGINX_WEBSOCKET_SEND_TIMEOUT:-3600s}"

if ! printf '%s' "${BACKEND_URL}" | grep -Eq '^([A-Za-z0-9._-]+|\[[0-9A-Fa-f:]+\]):[0-9]+$'; then
    echo "ERROR: BACKEND_URL must use host:port format without a protocol" >&2
    exit 1
fi

BACKEND_PORT="${BACKEND_URL##*:}"
if [ "${BACKEND_PORT}" -le 0 ] || [ "${BACKEND_PORT}" -gt 65535 ]; then
    echo "ERROR: BACKEND_URL port must be between 1 and 65535" >&2
    exit 1
fi

if ! printf '%s' "${NGINX_CLIENT_MAX_BODY_SIZE}" | grep -Eq '^[0-9]+[kKmMgG]?$'; then
    echo "ERROR: NGINX_CLIENT_MAX_BODY_SIZE must be an nginx size such as 250M" >&2
    exit 1
fi

CLIENT_MAX_BODY_SIZE_NUMBER=$(printf '%s' "${NGINX_CLIENT_MAX_BODY_SIZE}" | sed 's/[kKmMgG]$//')
if [ "${CLIENT_MAX_BODY_SIZE_NUMBER}" -le 0 ]; then
    echo "ERROR: NGINX_CLIENT_MAX_BODY_SIZE must be greater than zero" >&2
    exit 1
fi

validate_timeout() {
    variable_name="$1"
    variable_value="$2"
    if ! printf '%s' "${variable_value}" | grep -Eq '^[0-9]+(ms|s|m|h|d)?$'; then
        echo "ERROR: ${variable_name} must be an nginx duration such as 300s" >&2
        exit 1
    fi
    timeout_number=$(printf '%s' "${variable_value}" | sed 's/ms$//; s/[smhd]$//')
    if [ "${timeout_number}" -le 0 ]; then
        echo "ERROR: ${variable_name} must be greater than zero" >&2
        exit 1
    fi
}

validate_timeout "NGINX_PROXY_CONNECT_TIMEOUT" "${NGINX_PROXY_CONNECT_TIMEOUT}"
validate_timeout "NGINX_PROXY_SEND_TIMEOUT" "${NGINX_PROXY_SEND_TIMEOUT}"
validate_timeout "NGINX_PROXY_READ_TIMEOUT" "${NGINX_PROXY_READ_TIMEOUT}"
validate_timeout "NGINX_WEBSOCKET_READ_TIMEOUT" "${NGINX_WEBSOCKET_READ_TIMEOUT}"
validate_timeout "NGINX_WEBSOCKET_SEND_TIMEOUT" "${NGINX_WEBSOCKET_SEND_TIMEOUT}"

echo "Configuring nginx:"
echo "  BACKEND_URL=${BACKEND_URL}"
echo "  NGINX_CLIENT_MAX_BODY_SIZE=${NGINX_CLIENT_MAX_BODY_SIZE}"
echo "  API timeouts=${NGINX_PROXY_CONNECT_TIMEOUT}/${NGINX_PROXY_SEND_TIMEOUT}/${NGINX_PROXY_READ_TIMEOUT}"
echo "  WebSocket timeouts=${NGINX_WEBSOCKET_READ_TIMEOUT}/${NGINX_WEBSOCKET_SEND_TIMEOUT}"

escape_sed_replacement() {
    printf '%s\n' "$1" | sed 's/[\/&]/\\&/g'
}

ESCAPED_BACKEND_URL=$(escape_sed_replacement "${BACKEND_URL}")
ESCAPED_CLIENT_MAX_BODY_SIZE=$(escape_sed_replacement "${NGINX_CLIENT_MAX_BODY_SIZE}")
ESCAPED_PROXY_CONNECT_TIMEOUT=$(escape_sed_replacement "${NGINX_PROXY_CONNECT_TIMEOUT}")
ESCAPED_PROXY_SEND_TIMEOUT=$(escape_sed_replacement "${NGINX_PROXY_SEND_TIMEOUT}")
ESCAPED_PROXY_READ_TIMEOUT=$(escape_sed_replacement "${NGINX_PROXY_READ_TIMEOUT}")
ESCAPED_WEBSOCKET_READ_TIMEOUT=$(escape_sed_replacement "${NGINX_WEBSOCKET_READ_TIMEOUT}")
ESCAPED_WEBSOCKET_SEND_TIMEOUT=$(escape_sed_replacement "${NGINX_WEBSOCKET_SEND_TIMEOUT}")

# Replace only custom placeholders. Native nginx variables such as $host and
# $http_upgrade remain untouched.
sed \
    -e "s/__BACKEND_URL__/${ESCAPED_BACKEND_URL}/g" \
    -e "s/__NGINX_CLIENT_MAX_BODY_SIZE__/${ESCAPED_CLIENT_MAX_BODY_SIZE}/g" \
    -e "s/__NGINX_PROXY_CONNECT_TIMEOUT__/${ESCAPED_PROXY_CONNECT_TIMEOUT}/g" \
    -e "s/__NGINX_PROXY_SEND_TIMEOUT__/${ESCAPED_PROXY_SEND_TIMEOUT}/g" \
    -e "s/__NGINX_PROXY_READ_TIMEOUT__/${ESCAPED_PROXY_READ_TIMEOUT}/g" \
    -e "s/__NGINX_WEBSOCKET_READ_TIMEOUT__/${ESCAPED_WEBSOCKET_READ_TIMEOUT}/g" \
    -e "s/__NGINX_WEBSOCKET_SEND_TIMEOUT__/${ESCAPED_WEBSOCKET_SEND_TIMEOUT}/g" \
    /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Validate the generated nginx configuration before starting
echo "Validating nginx configuration..."
if ! nginx -t -c /etc/nginx/nginx.conf; then
    echo "ERROR: nginx configuration validation failed" >&2
    exit 1
fi

# Execute the main command (nginx)
exec "$@"
