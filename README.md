# Long-form Streaming MVP

The MVP runs as one Coolify container containing Next.js, Fastify, Redis, and a separate supervised FFmpeg/BullMQ worker process. Supabase PostgreSQL is external. Source and HLS media live in B2-compatible object storage.

## Start locally

1. Copy `.env.example` to `.env`, then provide the Supabase pooled `DATABASE_URL` and B2 credentials.
2. Run `npm install`.
3. Run `npm run db:generate`, then `npm run db:migrate`.
4. Run `docker compose up --build`.

Apply [the PostgreSQL migration](packages/database/drizzle/0000_tired_paibok.sql) with `npm run db:migrate` after setting `DATABASE_URL`.

## Coolify

Deploy `docker-compose.yml` as one Compose application. It has one public container on port `3000`; the API is proxied internally at `/api/v1`, while Redis and the encoding worker are private processes inside that same container. Use `REDIS_URL=redis://127.0.0.1:6379`.

The web app is at `http://localhost:3000`; API health is at `http://localhost:4000/health`.

## Core flow

An admin either creates a video, requests a direct B2 upload URL and queues encoding, or attaches an external HTTPS `.m3u8` master playlist. The API never proxies HLS delivery. Shows have seasons, and episodes are regular playable videos bound to a season.

## Metadata and monetization

Set `TMDB_API_KEY` to enable the admin TMDb lookup endpoint. Set `POPADS_SCRIPT_URL` to enable PopAds for non-premium viewers. `VAST_TAG_URL` is supplied only for non-premium playback and is ready for a VAST player adapter. Premium status remains server-derived from the crypto subscription record; no Stripe integration is used.
