# Backend

The backend is an Express and Socket.IO TypeScript service in `backend/src`.
Configuration is loaded and validated by `backend/src/config.ts`, and server
initialization starts in `backend/src/index.ts`.

## Local development

```bash
docker compose up -d postgres
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

The default direct development address is:

```txt
http://localhost:8000
```

Health:

```bash
curl -i http://localhost:8000/health
```

MCP:

```txt
http://localhost:8000/mcp
```

## Tests

Backend integration tests require a PostgreSQL test database:

```bash
cd backend
npm test
```

Never use production credentials or production data in the test database.
