# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A standalone Vercel serverless service that holds a single `GEMINI_API_KEY` and issues short-lived tokens to multiple client projects. Clients never see the real key.

## Commands

```bash
npm run dev        # Local dev via `vercel dev` (requires Vercel CLI installed globally)
npm run typecheck  # tsc --noEmit — the only validation step; no tests or linter configured
```

## Architecture

Two token flows, four endpoints:

1. **Live API flow** — `POST /api/token/live` mints a real Gemini ephemeral auth token via `ai.authTokens.create()`. The client then connects directly to Gemini's Live WebSocket using that token. Single-use, 60s to start session, 1hr expiry.

2. **Proxy flow** — `POST /api/token/proxy` issues an HS256 JWT (1hr). The client sends that JWT as a Bearer token to `POST /api/proxy/generate`, which verifies it and forwards the `generateContent` call to Gemini using the real API key.

Both flows require `clientId` + `clientSecret` in the request body, validated against the `CLIENTS_JSON` env var.

`GET /api/health` — liveness check.

### Lib layer

- **`lib/auth.ts`** — Parses `CLIENTS_JSON` once (singleton cache), exposes `verifyClientCredentials()` with constant-time secret comparison (`timingSafeEqual`). Also `getClientById()` for JWT-authenticated proxy requests.
- **`lib/gemini.ts`** — Singleton `GoogleGenAI` client, `mintLiveToken()`, model allowlist from `ALLOWED_MODELS` env var.
- **`lib/jwt.ts`** — `signProxyJwt()` / `verifyProxyJwt()` (HS256), `extractBearerToken()`. Note: `expiresAt` returned to clients is in **milliseconds**; JWT `exp` claim is in seconds.
- **`lib/cors.ts`** — Sets CORS headers on every response. Per-client `allowedOrigins` enforcement; if the client config omits `allowedOrigins`, origin check is skipped.

### Request pipeline (every endpoint)

```
handleOptions (preflight) → setBaseCorsHeaders → verify credentials or JWT
→ enforceClientOrigin → validate model against allowlist → business logic → response
```

## Environment Variables

All set in Vercel dashboard, never committed. See `.env.example` for shape.

| Var | Notes |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key |
| `JWT_SECRET` | HS256 secret, minimum 16 chars |
| `CLIENTS_JSON` | JSON array: `[{"id":"...","secret":"...","allowedOrigins":["..."]}]` |
| `ALLOWED_MODELS` | Comma-separated model IDs |

## Deployment

Vercel Serverless Functions. Region pinned to `bom1` (Mumbai). `api/proxy/generate.ts` has 30s maxDuration; token endpoints have 10s.

## Key Patterns to Preserve

- Singleton caching in `auth.ts` and `gemini.ts` — config changes require a new cold start
- Constant-time secret comparison — do not replace with `===`
- All styling in client projects uses Tailwind (not custom CSS)
