# Windwise architecture

Version 1.0 · January 2026 snapshot

Windwise is a small, deliberately boring system wrapped around an unusually careful analytics core.
The goal is reproducibility: the same committed SQLite file, the same FastAPI process, and the same
React bundle should produce the same numbers on a laptop, in Docker, and on Vercel.

## 1. System context

```text
                    ┌─────────────────────────────────────────────┐
                    │                Browser                     │
                    │  React 19 + TypeScript + Vite               │
                    │  Desk / Accuracy / Snapshots / Method       │
                    └───────────────┬─────────────────────────────┘
                                    │  GET /api/v1/*
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │             FastAPI (Python 3.12)           │
                    │  routes → service caches → analytics        │
                    │  CSV exports · SPA static mount · health    │
                    └───────────────┬─────────────────────────────┘
                                    │  read-only, checksum-verified
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │        windwise.sqlite (2.5 MB)             │
                    │  actual(FUELHH) · forecast(WINDFOR) · meta  │
                    └─────────────────────────────────────────────┘
```

There is no database server, no background worker, no external API call at request time, and no
write path. The snapshot is built offline and committed. That makes the deployment small and the
results auditable.

## 2. Request lifecycle

1. **Boot.** `main.py` creates the FastAPI app and registers middleware. The lifespan hook calls
   `get_analytics()`, which loads the SQLite file into memory, verifies its SHA-256 against
   `manifest.json`, and builds the `Analytics` object.
2. **Request.** Middleware assigns a request ID, adds security headers, and handles gzip. A path
   normaliser rewrites Vercel's `__path` query parameter back into the original path.
3. **Validation.** The route validates `date` (must be a real date inside 1–31 January 2026) and
   `gate` (`n2ex`, `epex`, `epex_hh`). Invalid input returns a structured 422.
4. **Service.** `service.py` provides process-wide `lru_cache` wrappers keyed by the actual
   parameters. Repeated views of the same day/gate/share are cheap.
5. **Analytics.** `Analytics` selects the gate snapshot, builds hourly pairs, computes calibration,
   bands, firm wind, cover, outturn, revisions, and the response payload.
6. **Response.** FastAPI serialises the payload; CSV routes stream a generated file; the SPA mount
   serves the built client for non-API paths.

The analytics object caches snapshot choices, hourly pairs, calibrations, reliability, revisions,
horizon statistics, and gate comparisons per process. The data is immutable, so these caches never
need invalidation.

## 3. Backend modules

| Module | Responsibility |
| --- | --- |
| `backend/app/data_store.py` | Locates the SQLite file, opens it read-only, loads actuals and forecasts into dictionaries, verifies the manifest checksum, averages half-hours into hourly actuals. |
| `backend/app/analytics.py` | Gate definitions, snapshot selection, hourly pair construction, calibration, LODO quantiles, desk payload, accuracy payload, snapshot payload, reliability, revisions, horizon skill, gate comparison, metadata. |
| `backend/app/service.py` | Singleton analytics wiring and response caches; test reset hook. |
| `backend/app/main.py` | FastAPI app, middleware, routes, CSV exports, error handling, health, SPA mount. |
| `backend/scripts/` | Offline snapshot builder and inspection helpers; not used at runtime. |
| `backend/tests/` | 37 pytest tests covering analytics, API contracts, gates, and no-look-ahead behaviour. |

### 3.1 Data model

```sql
CREATE TABLE actual (
    start_time   TEXT PRIMARY KEY,   -- ISO-8601 UTC half-hour
    publish_time TEXT NOT NULL,
    generation   REAL NOT NULL CHECK (generation >= 0)
);

CREATE TABLE forecast (
    publish_time TEXT NOT NULL,      -- ISO-8601 UTC snapshot
    start_time   TEXT NOT NULL,      -- ISO-8601 UTC target half-hour
    generation   REAL NOT NULL CHECK (generation >= 0),
    PRIMARY KEY (publish_time, start_time)
);

CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

The in-memory shape is `dict[publish_time, dict[start_time, MW]]` for forecasts and
`dict[start_time, MW]` for actuals. Hourly actuals are memoised per delivery day. This is more than
fast enough for 18,688 forecast rows.

### 3.2 Error model

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "invalid_date",
    "message": "Date 2026-02-01 is outside the January 2026 delivery window ...",
    "request_id": "..."
  }
}
```

FastAPI validation errors are normalised into the same shape. Every response carries
`X-Request-ID` and conservative security headers. CORS allows GET/HEAD/OPTIONS from any origin
because the API is public and read-only.

### 3.3 Caching and performance

- SQLite load is one-time at boot (a few tens of milliseconds for 2.5 MB).
- Response caches are bounded: 128 desk payloads, 16 accuracy payloads, 64 snapshot payloads, 4 meta
  payloads. A full month of distinct desk requests is 31 days × 3 gates × shares; the share key can
  grow, but 128 entries is sufficient for normal use and bounded.
- The whole API is CPU-light. No request performs a network call.
- Gzip is enabled above 1 KB; the accuracy payload is the largest response.

## 4. Frontend architecture

```text
frontend/src/
├── api.ts                 Typed fetch wrapper, ApiError, CSV URL builder
├── App.tsx                Route state, meta/desk/accuracy/snapshot queries, view switch
├── hooks.ts               Shared query hooks and reduced-motion helper
├── types.ts               API response types
├── lib/
│   ├── route.ts           URL <-> Route, defaults, clamping, history integration
│   ├── cover.ts           Client-side cover arithmetic and summary
│   └── format.ts          Date, MW/GW, percentage, pluralisation helpers
├── components/
│   ├── Header.tsx         Navigation, date/gate context, API/source links
│   ├── Footer.tsx         Product/data/build links, disclaimer
│   ├── ui.tsx             Cards, chips, controls, icons, tooltips, Skeletons
│   ├── Windscape.tsx      Custom isometric turbine visual (SVG + motion)
│   └── Reveal.tsx         Scroll reveal wrapper
├── pages/
│   ├── DeskPage.tsx       Hero, metrics, forecast/firm chart, cover calculator, hourly book
│   ├── AccuracyPage.tsx   Ledger, scatter, histogram, heatmap, coverage, gates, horizon, revisions
│   ├── SnapshotsPage.tsx  Revision path, gate comparison, fallback notice
│   └── MethodPage.tsx     Rules, provenance, limitations, FAQ, AI disclosure
└── styles.css             Tailwind layers, editorial type, cards, tables, motion
```

### 4.1 State and data flow

- `useRoute()` parses `window.location.search`, canonicalises missing keys with `replaceState`, and
  listens for `popstate`. Navigation pushes a new URL and scrolls to top. Every view is linkable.
- React Query owns server state. The desk query is keyed by `[date, gate, share]`; the accuracy
  query by `gate`; the snapshots query by `[date, gate]`. Loading and error states are explicit.
- The client recomputes cover locally from the API's `firm_mw` and `forecast_mw` so the share slider
  responds instantly without a round trip. The server's cover summary is the source of truth for the
  headline numbers; the client formula is unit-tested against the same rule.
- There is no global store. URL + query cache is enough.

### 4.2 Visual system

- **Palette:** warm paper `#F3F6F1`, ink greens, teal `#1F6F5C`, sand and a restrained red for
  error. Light only; no dark mode.
- **Type:** Instrument Serif for display, Instrument Sans for UI, IBM Plex Mono for labels and
  numbers. Fonts are bundled via Fontsource, so there is no runtime Google Fonts request.
- **Cards:** white/60 glass, 1px white borders, soft shadows, 20–28 px radii.
- **Charts:** hand-built SVG, no charting dependency. The forecast chart layers calibrated line,
  raw line, 80% band, 95% band, firm-90 line, and actual line. The accuracy view uses scatter,
  histogram, heatmap, and small multiples.
- **Windscape:** a custom isometric scene of turbines, sea, and sky. Rotor speed and blade angle are
  driven by the selected day's wind level. It is decorative but data-linked; it is not a chart.
- **Motion:** Framer Motion for entry reveals and chart draw-in, disabled under
  `prefers-reduced-motion`. Tables and controls remain static.

### 4.3 Responsive and accessibility

- Breakpoints at 390, 768, 1024, 1280, and 1440 px. The header is non-sticky below `sm` to avoid
  eating mobile viewport; the desk controls stack and the hourly table scrolls horizontally with a
  visible swipe hint.
- Semantic landmarks, labelled controls, visible focus rings, keyboard-operable tabs and sliders,
  `aria-live` for async status, and color contrast checked against the paper background.
- Charts include text summaries and table alternatives; they are not the only way to read a number.
- Reduced motion is respected for both CSS and Framer Motion.

## 5. Deployment topologies

### 5.1 Vercel (primary)

```text
Vercel
├── static build: frontend/dist          (outputDirectory)
└── Python function: api/index.py        (includeFiles: backend/app/data/**)
        └── imports app.main:app
```

`vercel.json`:

- builds the frontend with `npm --prefix frontend ci && npm --prefix frontend run build`;
- bundles the SQLite data with the function;
- rewrites `/api/(.*)` to `/api/index?__path=$1`;
- serves filesystem assets, then falls back to `/index.html` for SPA routes.

The function's `PathNormalizer` middleware restores the original path from `__path`, so FastAPI sees
`/api/v1/desk` rather than `/api/index`. This is the one Vercel-specific piece of code; everything
else is identical to Docker.

### 5.2 Docker (local and Heroku)

The `Dockerfile` is a two-stage build:

1. `node:20-alpine` installs frontend dependencies, builds the Vite bundle.
2. `python:3.12-slim` installs `requirements-server.txt`, copies the backend and the built client to
   `/app/backend/static`, drops to the `windwise` user, and runs uvicorn on `$PORT` (default 8000).

`docker compose up --build` publishes 8000 and defines a health check against `/api/v1/health`.
The same image works on Heroku's container stack because the command honours `$PORT`.

### 5.3 Local development

- Backend: uvicorn on 8000 with `--reload`, from `backend/`.
- Frontend: Vite on 5173, proxying `/api` to 8000.
- Tests: pytest from the repo root; Vitest from `frontend/`.

## 6. Security and reliability

- **Read-only by construction.** No write endpoints, no user input reaches SQL, no file uploads.
- **Checksum verification.** The database hash is checked at boot; health reports degradation.
- **Bounded input.** Dates are parsed with `date.fromisoformat` and range-checked; gates are an enum;
  share is clamped to 0–100.
- **No secrets.** The app needs no API keys, database URLs, or credentials. `.env*` is ignored except
  `.env.example`.
- **Headers.** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a restrictive
  `Permissions-Policy` are set; HSTS is delegated to the platform.
- **Failure mode.** A missing snapshot fails at boot rather than serving plausible-looking numbers
  from a partial dataset; a checksum mismatch sets `/api/v1/health` to `degraded` and
  `checksum_verified: false`. If a single response is invalid, the client shows an explicit error
  card with a retry, not a blank chart. The 16 January fallback is surfaced in the UI rather than
  hidden.
- **No look-ahead.** Enforced in code and tests; see `docs/METHOD.md` §8.

## 7. Testing strategy

| Layer | Tool | What it proves |
| --- | --- | --- |
| Analytics unit/integration | pytest | Gate selection, hourly matching, calibration timing, LODO bands, cover math, metrics, reliability |
| API contract | pytest + FastAPI TestClient | Status codes, payload shape, CSV contents, error envelope, health, static fallback |
| No-look-ahead | pytest mutation tests | Future snapshots/actuals cannot enter a decision |
| Frontend logic | Vitest | URL parsing/canonicalisation, cover arithmetic and summaries |
| Type safety | `tsc --noEmit` | Strict TypeScript across the client |
| Build | Vite | Production bundle is generated |
| CI | GitHub Actions | All of the above on every push/PR |

The tests run against the committed snapshot, so they also act as a regression check on the data
file itself.

## 8. Deliberate constraints

- **One month, one snapshot.** No ingestion pipeline, no scheduler, no database migrations. The
  archive is the product.
- **No price/demand model.** The brief is wind risk, not market simulation. Adding prices would
  create claims the data cannot support.
- **No ML.** A one-parameter ratio is easier to audit and harder to overfit. The residual
  distribution is the interesting object.
- **No chart library.** Custom SVG keeps the visual language consistent and avoids a large
  dependency; the cost is more code in `ui.tsx` and the pages.
- **No SSR.** The app is a client-rendered SPA behind a static host. The data is small and the
  interaction is stateful; SSR would add complexity without a user-facing benefit.

## 9. Operational checklist

1. `docker compose up --build` → `http://localhost:8000/api/v1/health` returns `status: ok`.
2. `pytest backend/tests -q` → 37 passed.
3. `cd frontend && npm run typecheck && npm test && npm run build` → clean.
4. Verify `/api/docs`, `/api/v1/desk`, both CSV downloads, and a deep link such as
   `/?view=accuracy&gate=epex_hh`.
5. On Vercel, repeat the same checks against the production URL in an incognito window.
6. Confirm the snapshot SHA-256 in the UI footer/health matches
   `b992913db1eb2af9eb192412719fb3a2e5ea13904671a5594fa976f51a1079c4`.
