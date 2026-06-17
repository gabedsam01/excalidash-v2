# Deployment and reverse proxies

ExcaliDash exposes only the frontend service to users. The frontend Nginx
serves the application and proxies `/api/` and `/socket.io/` to the backend.
External gateways should therefore route traffic to the frontend, not directly
to the backend.

## Common configuration

Copy the Compose environment example and adjust it:

```bash
cp .env.example .env
docker compose config
docker compose up --build -d
```

For direct local access at `http://localhost:6767`, keep:

```env
FRONTEND_URL=http://localhost:6767
TRUST_PROXY=false
ENFORCE_HTTPS_REDIRECT=false
```

For a public HTTPS origin behind a trusted external proxy, use:

```env
FRONTEND_URL=https://excalidash.example.com
TRUST_PROXY=1
ENFORCE_HTTPS_REDIRECT=false
```

`TRUST_PROXY=1` trusts the frontend Nginx hop that normalizes forwarded
headers. Do not enable proxy trust when clients can reach the backend directly.
Keep `ENFORCE_HTTPS_REDIRECT=false` when the external gateway already redirects
HTTP to HTTPS; this prevents redirect loops caused by incomplete forwarded
headers.

The effective upload ceiling is the smallest limit in the request path:

- external gateway or tunnel limit;
- `NGINX_CLIENT_MAX_BODY_SIZE`;
- `MAX_UPLOAD_MB` for multipart backup/database uploads;
- `MAX_JSON_BODY_MB` for individual drawing JSON imports;
- import-specific extracted-content limits.

After changing limits, recreate both services:

```bash
docker compose up -d --force-recreate backend frontend
```

## External Nginx

```nginx
server {
  server_name excalidash.example.com;

  client_max_body_size 250M;

  location / {
    proxy_pass http://127.0.0.1:6767;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:6767/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

Terminate TLS in the external Nginx and route both normal traffic and
`/socket.io/` to port `6767`.

## Caddy

```caddyfile
excalidash.example.com {
  request_body {
    max_size 250MB
  }
  reverse_proxy 127.0.0.1:6767
}
```

Caddy handles WebSocket upgrades automatically. The public origin still needs
to be configured in `FRONTEND_URL`.

## Traefik

Traefik is optional. The base Compose files do not contain or require Traefik
labels. If the frontend service shares a network with Traefik, labels can be
added in a local override:

```yaml
services:
  frontend:
    labels:
      - traefik.enable=true
      - traefik.http.routers.excalidash.rule=Host(`excalidash.example.com`)
      - traefik.http.routers.excalidash.entrypoints=websecure
      - traefik.http.routers.excalidash.tls.certresolver=letsencrypt
      - traefik.http.services.excalidash.loadbalancer.server.port=80
```

Traefik supports WebSocket upgrades without a separate Socket.IO router. If a
buffering/body-size middleware is enabled globally, ensure its limit is at
least as large as `NGINX_CLIENT_MAX_BODY_SIZE`.

## Cloudflare Tunnel

Point the tunnel at the frontend service or published frontend port:

```yaml
ingress:
  - hostname: excalidash.example.com
    service: http://localhost:6767
  - service: http_status:404
```

Cloudflare Tunnel supports WebSockets. Configure the same public hostname in
`FRONTEND_URL`, set `TRUST_PROXY=1`, and keep
`ENFORCE_HTTPS_REDIRECT=false`. Cloudflare account/product request-size limits
still apply and cannot be raised by ExcaliDash.

## Coolify, Easypanel, and Dokploy

Deploy both Compose services and expose only the frontend service on container
port `80`. Configure the platform domain/TLS proxy to target that port.

Set these variables in the panel:

```env
FRONTEND_URL=https://excalidash.example.com
TRUST_PROXY=1
ENFORCE_HTTPS_REDIRECT=false
BACKEND_URL=backend:8000
NGINX_CLIENT_MAX_BODY_SIZE=250M
```

Do not expose backend port `8000` publicly. If the platform has its own upload
limit or proxy timeout controls, align them with the Nginx and backend values.
No platform-specific labels are required by the base Compose files.

## Large upload verification

Generate a valid large drawing fixture:

```bash
node scripts/generate-large-excalidraw.cjs \
  --size-mb 35 \
  --output /tmp/excalidash-large-35mb.excalidraw
```

Then use the dashboard **Import** action to upload that file. This exercises the
real individual drawing path: browser file parsing, preview generation, the
frontend Nginx `/api/` proxy, Express JSON parsing, validation, and persistence.

For backup imports, use **Settings → Advanced / Legacy → Import Backup**. A
multipart backup must fit under both `NGINX_CLIENT_MAX_BODY_SIZE` and
`MAX_UPLOAD_MB`; each extracted drawing and the total extracted data are also
checked independently.

When a configured limit is exceeded, the backend returns HTTP 413:

```json
{
  "error": "Payload too large",
  "message": "The uploaded file exceeds the configured limit.",
  "limitMb": 250,
  "code": "PAYLOAD_TOO_LARGE"
}
```
