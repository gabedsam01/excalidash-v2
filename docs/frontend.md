# Frontend

The frontend is a React and Vite application in `frontend/src`. API access is
centralized in `frontend/src/api/index.ts`. Production Nginx routing is defined
by `frontend/nginx.conf.template`.

## Local development

Start the backend first, then:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev -- --port 5173
```

Open:

```txt
http://localhost:5173
```

The Vite proxy sends `/api` and Socket.IO traffic to
`http://localhost:8000`. The production frontend also proxies `/mcp`; direct
frontend development should use `http://localhost:8000/mcp` for MCP clients.

## Tests

```bash
cd frontend
npm test
```
