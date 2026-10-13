# Goal Tracker — backend

Express 5 + Mongoose API, plus a BullMQ worker for notifications.

## Run locally

```bash
cp .env.example .env        # fill in MONGO_URI, JWT_SECRET (and Resend keys to send email)
redis-server                # or: brew services start redis
npm run dev                 # API on :3000
npm run worker              # notification worker (separate terminal)
```

The API works without the worker or Redis: in-app notifications are still stored, and emails wait
in MongoDB with status `queued` until the worker is running (a sweep re-queues them every 15 minutes).

## Notifications

```
controller ─(background)─▶ notification.service ─▶ message generator (templates today, AI later)
                                │ in-app: stored = delivered
                                └ email: status "queued" ─▶ BullMQ "notifications" queue ─▶ worker ─▶ Resend
worker also runs: daily task-reminder scan (REMINDER_CRON) and the stale-email sweep
```

- Code: `src/services/notifications`, `src/services/email`, `src/queue`, `worker.js`.
- Deduplication: `Notification.dedupeKey` (unique). Rate limiting: per-user email cap + provider cap in the worker.
- Failed delivery jobs stay in BullMQ's failed set for 7 days; the notification gets `status: "failed"` and `lastError`.

## Errors

Every error response has one shape (see `src/utils/apiError.js`):

```json
{ "success": false, "code": "GOAL_NOT_FOUND", "message": "Goal not found", "requestId": "…", "field": "title" }
```

- `code` is the stable contract; the frontend (`src/lib/errors.js`) chooses the wording from it.
- `field` (400s only) names the form field a validation message is about.
- 5xx messages and library messages (Mongo/cast/validation internals) never reach the client; the
  original is logged as `http.error` / `http.client_error_withheld` with the same `requestId`, which
  is also sent as the `X-Request-Id` header.

## Production

Required: `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET` (32+ characters), `FRONTEND_URL`
(the deployed frontend origin, e.g. `https://goals.example.com`). The API refuses to start without them.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default 3000). |
| `FRONTEND_URL` | Allowed CORS origin, and the base of links in emails. |
| `CORS_ORIGINS` | Optional comma-separated list of allowed origins (overrides `FRONTEND_URL` for CORS). |
| `COOKIE_SAMESITE` | `lax` (default) when the frontend and API share a site (e.g. `app.example.com` + `api.example.com`); `none` when they are on different sites (forces `Secure`). |
| `TRUST_PROXY` | Set to `1` behind a load balancer / PaaS proxy so rate limits see the real client IP. |
| `REDIS_URL` | Redis for the notification queue (`rediss://` for TLS). Run `npm run worker` as a second process. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email delivery (password reset, reminders). Without them emails are marked failed; the app keeps working. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | AI roadmaps. Without a key the planner reports itself unavailable. |
| `AI_ROADMAPS_PER_HOUR` | Generations per user per hour (default 20). |
| `AUTH_LOGIN_FAILURES_PER_15_MIN`, `AUTH_LOGINS_PER_IP_PER_15_MIN`, `AUTH_REGISTRATIONS_PER_IP_PER_HOUR` | Auth rate limits (defaults 10 / 100 / 30). |

`GET /api/health` answers 200 while the database is connected (503 otherwise) — use it as the
platform health check. Rate limits are in memory per API process; with several API instances, move
them to Redis.

## Tests

```bash
npm test                                         # in-memory MongoDB; Redis tests skip if Redis is down
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test   # point the queue tests at a specific Redis
```

Tests never use `MONGO_URI`.

Browser tests live in `frontend/e2e` (`npm run test:e2e` there). They start `scripts/e2e-server.js`:
an in-memory MongoDB, a local fake of the AI provider and captured (never sent) email.
