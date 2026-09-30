# SparkJoy Posts — Full Stack Assignment

A small posts-browsing application: users log in, browse ~10,000 seeded posts, view post detail with safely-rendered HTML content, filter by tag, and search by title.

## Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Database | PostgreSQL 16 | Relational fit for the posts↔tags many-to-many; standard tooling, easy Docker setup |
| Backend | NestJS 11 (default), Gin + GORM (optional) | NestJS remains the default; the Go API implements the same frontend-facing routes |
| Data access | Prisma 6 (NestJS), GORM (Go) | Both use the same PostgreSQL schema; Prisma owns migrations and seeding |
| Frontend | Next.js 15 (App Router) + TanStack Query | Assignment requires Next or Nuxt; TanStack Query gives caching, loading/error states declaratively |
| Styling | Tailwind CSS 4 (+ typography plugin) | Fast to build a clean, responsive UI; `prose` styles the post HTML content |
| Auth | JWT in an httpOnly cookie | See [Design decisions](#design-decisions) |

## Project Structure

```
├── compose.yml           # db + backend + frontend
├── posts.json            # seed data (mounted into the backend container)
├── backend/
│   ├── prisma/           # schema + committed SQL migrations
│   └── src/
│       ├── auth/         # login/logout/me, JWT guard (global), DTOs
│       ├── posts/        # list (paginated/filtered) + detail
│       ├── tags/         # tag list with post counts
│       ├── health/       # liveness + DB check
│       ├── seed/         # idempotent seeder (auto-runs on startup)
│       └── prisma/       # PrismaService (connection lifecycle)
├── backend-go/            # optional Gin + GORM API over the same PostgreSQL data
│   ├── cmd/api/           # composition root and server startup
│   └── internal/
│       ├── domain/        # post, tag, and user models
│       ├── application/   # use cases and repository/token interfaces
│       ├── infrastructure/ # GORM/PostgreSQL, JWT, bcrypt implementations
│       └── transport/http/ # Gin routes, request validation, cookies
└── frontend/
    └── src/
        ├── middleware.ts # cookie-presence redirect (/login ↔ /)
        ├── app/          # login, posts list, post detail
        ├── components/   # header, post card, tag badge, pagination
        └── lib/api.ts    # fetch wrapper + API types
```

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Swagger docs | http://localhost:4000/docs |
| Health check | http://localhost:4000/health |
| PostgreSQL | internal only (add a `ports` mapping to `db` if you need psql access) |

### Use the Go backend

The NestJS backend stays intact on port 4000 and owns the existing Prisma migration and idempotent seed. The optional Gin + GORM API reads the same database on port 4001. The Compose override points the frontend at Go without changing frontend code:

```bash
docker compose -f compose.yml -f compose.go.yml up --build
```

Open the frontend at http://localhost:3000 and use the same test account. `GET /health`, login/logout/me, posts list/detail, and tags are implemented in Go. The Go API returns the same response shapes and uses the same JWT secret and cookie name. Swagger remains on the NestJS API at http://localhost:4000/docs; Go does not serve `/docs`.

For local Go development, start and seed the NestJS backend first, set the variables shown in `backend-go/.env.example`, then run `cd backend-go && go run ./cmd/api`. The Go server waits for seeded posts before serving requests.

Set `TRUSTED_PROXIES` only to the exact proxy IP/CIDR when that proxy forwards the original client IP. The default trusts no forwarded headers. With the current Next.js rewrite, rate limits are keyed by the frontend container's IP.

**Test account** (created automatically by the seed):

- Email: `admin@example.com`
- Password: `Password123!`

(Configurable via `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` in `.env`.)

### Stopping / resetting

```bash
docker compose down        # stop
docker compose down -v     # stop AND wipe the database (next start re-seeds)
```

## Environment Variables

All variables have working development defaults in `compose.yml`; `.env` overrides them. See `.env.example` for the full list:

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — database credentials
- `JWT_SECRET` — signing key for auth tokens (change outside local dev)
- `JWT_EXPIRES_IN` — token lifetime (default `1d`)
- `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` — test account credentials
- `COOKIE_SECURE` — set `true` behind HTTPS so the auth cookie is `Secure`

## Seeding

Seeding is **automatic and idempotent**: on startup the backend

1. upserts the test user,
2. checks whether any posts exist — if yes, skips,
3. otherwise reads `posts.json` (mounted at `/app/posts.json`), sanitizes each post's HTML, computes a plain-text excerpt, and bulk-inserts posts + tags in batches of 1,000.

Re-running `docker compose up` never duplicates data. To force a re-seed: `docker compose down -v && docker compose up`.

Manual seeding (local, non-Docker): `cd backend && npm run seed` (same code path, reads `SEED_FILE`, defaults to `../posts.json`).

## Running Without Docker

Requires Node 22+ and a local PostgreSQL.

```bash
# backend — http://localhost:4000
cd backend
cp .env.example .env        # or edit backend/.env; set DATABASE_URL to your Postgres
npm install
npx prisma migrate deploy
npm run start:dev           # seeds automatically on boot

# frontend — http://localhost:3000 (proxies /api → localhost:4000 by default)
cd frontend
npm install
npm run dev
```

## API Summary

All endpoints except `POST /auth/login` and `GET /health` require the auth cookie. Full interactive docs at `/docs` (Swagger).

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → sets `access_token` httpOnly cookie. Rate-limited to 5/min per IP |
| POST | `/auth/logout` | Clears the cookie |
| GET | `/auth/me` | Current user from the JWT |
| GET | `/posts?page&limit&tag&search` | Paginated list (default 20, max 100). `tag` = exact tag name, `search` = case-insensitive title match (LIKE metacharacters are escaped, so `%` and `_` match literally). Returns excerpts, not full content |
| GET | `/posts/:id` | Full post incl. sanitized HTML `content` |
| GET | `/tags` | All tags with post counts (drives the filter UI) |
| GET | `/health` | Liveness + DB connectivity |

Errors follow NestJS's standard shape: `{ statusCode, message, error }` — `400` validation, `401` unauthenticated, `404` unknown post, `429` rate-limited.

## Testing

Go unit tests and static checks:

```bash
cd backend-go
go test ./...
go vet ./...
```

Integration tests (Jest + Supertest) boot the real Nest app — same guards, pipes and Prisma wiring as production (shared `configureApp()`) — against a disposable Postgres. 18 tests cover auth (cookie flags, tampered token, no user enumeration), posts (pagination, sorting, tag filter, search including LIKE-metacharacter escaping, validation, 404), sanitization (no XSS vectors in stored content), tags, and rate limiting. Assertions are data-agnostic: they pass with any `posts.json`, not just the sample.

```bash
# one-time: disposable test database on :5433
docker run --rm -d --name sparkjoy-test-db \
  -e POSTGRES_USER=sparkjoy -e POSTGRES_PASSWORD=sparkjoy -e POSTGRES_DB=sparkjoy_test \
  -p 5433:5432 postgres:16-alpine

cd backend
DATABASE_URL=postgresql://sparkjoy:sparkjoy@localhost:5433/sparkjoy_test \
  npx prisma migrate deploy
DATABASE_URL=postgresql://sparkjoy:sparkjoy@localhost:5433/sparkjoy_test \
  JWT_SECRET=test-secret npm run test:e2e

docker stop sparkjoy-test-db   # cleanup
```

> Note: the `test:e2e` script seeds via `tsx` before Jest starts — `sanitize-html` depends on the ESM-only `htmlparser2` v10, which Node 22's `require(esm)` handles at runtime but Jest's transformer cannot.

## Design Decisions

**Primary key — UUID v7.** The source data has no `id`. UUID v7 is time-ordered (good B-tree index locality, unlike random v4) and non-enumerable (unlike serial integers, IDs don't leak row counts or allow URL guessing). Generated in the seeder since Postgres 16 has no native v7.

**Tags — normalized many-to-many.** `Tag` + `PostTag` join table with a composite PK `(postId, tagId)` and an index on `tagId`. Filtering by tag resolves to an indexed lookup on the join table rather than a scan of an array column — Prisma's `some` compiles to a correlated `EXISTS` subquery, which plans as a bitmap index scan on `PostTag_tagId_idx` — and `GET /tags` (with counts) falls out of the model naturally.

**`postedBy` — plain string column.** No requirement filters or joins on author, so normalizing authors into their own table would be speculative. If author profiles/filtering arrive later, it's a straightforward migration.

**Auth — JWT in an httpOnly cookie.** Stateless (no session table/Redis), which fits a read-only app of this size. `httpOnly` keeps the token away from JS (XSS can't steal it); `SameSite=Lax` mitigates CSRF; login responds with the same message for unknown email vs wrong password (no user enumeration) and is rate-limited. Trade-off: JWTs can't be revoked before expiry — mitigated with a 1-day lifetime; refresh-token rotation is the natural next step.

**HTML safety — sanitize once, at the ingest boundary.** `posts.json` is the only untrusted content source, so the seeder runs every post through `sanitize-html` (strips `<script>`, event handlers, `javascript:` URLs) **before** it reaches the database. The DB stores only clean HTML, every consumer can render it as-is, and the cost is paid once instead of per-request. The sample data includes XSS payloads to demonstrate this. If the app ever accepts user-authored posts, the same sanitization moves to that write path.

**List payload — excerpts, not content.** With ~10k posts, shipping full HTML for 20 list items per page is wasted bandwidth. A plain-text ~200-char excerpt is precomputed at seed time (a column, not a per-request computation).

**Pagination — offset (`page`/`limit`).** Simple on both ends and enables a "page X of Y" UI. At 10k rows, offset cost is negligible; at millions of rows I'd switch to cursor-based pagination (the time-ordered UUID v7 PK is ready for that).

**Frontend data flow — client-side fetching through a same-origin proxy.** Next.js rewrites `/api/*` to the backend, so the browser sees a single origin: the auth cookie flows automatically and no CORS configuration exists to get wrong. Next middleware only checks that the cookie *exists* (UX redirect); actual verification is the backend's job — a 401 response redirects to `/login` via the fetch wrapper. The app is behind a login, so SEO/SSR brings no benefit here.

## Extras Implemented

- Integration test suite — 18 tests against the real app + real Postgres (see Testing)
- Pagination + title search (debounced) + tag filter, all URL-driven (back button / refresh / shareable links work)
- Loading skeletons, error states with retry, empty states
- Swagger/OpenAPI docs at `/docs`
- Health check endpoint (`/health`, includes DB connectivity)
- Rate limiting (global 100/min, login 5/min per client IP — `trust proxy` is set so the real IP survives the Next.js rewrite proxy)
- Committed database migrations (`prisma migrate deploy` on container start)
- Responsive layout

## Not Done / Next Steps

- **Frontend component tests** — backend integration tests exist (see Testing); with more time I'd add component tests for the list page (filter/search interactions) and an E2E happy path with Playwright.
- **Refresh tokens** — would remove the revocation trade-off of pure JWTs.
- **CI/CD** — a GitHub Actions workflow running typecheck + build + tests on PR.
- **Caching** — `GET /tags` and hot post pages are natural candidates (HTTP cache headers or a small in-memory cache); skipped because 10k rows in Postgres doesn't need it yet.

## Known Trade-offs / Limitations

- The seeder loads the whole `posts.json` into memory (~10k records ≈ tens of MB) — fine at this scale; a streaming parser would be the fix for much larger files.
- `API_URL` for the frontend is baked at image build time (Next rewrites are resolved during `next build`) — changing the backend address requires an image rebuild.
- The auth cookie is not `Secure` by default so the stack works over plain `http://localhost`; set `COOKIE_SECURE=true` behind HTTPS.
- Tag filter accepts a single tag (matching the requirement); multi-tag AND/OR filtering would extend the same query shape.
- Title search uses `ILIKE '%term%'`, whose leading wildcard cannot use an index as a predicate. At this scale the first page still costs ~1ms (Postgres walks the `postedAt` index and stops after 20 rows), but the accompanying `count(*)` sequentially scans on every request (~8ms/9.8k rows). Caching or estimating the total — or moving to cursor pagination, which needs no count — would pay off before `pg_trgm`/`tsvector` does.
- Tag-filtered lists must sort after filtering: the indexes on `Post(postedAt)` and `PostTag(tagId)` are separate, so no single index covers both. A composite index would require denormalizing `postedAt` into `PostTag`.
