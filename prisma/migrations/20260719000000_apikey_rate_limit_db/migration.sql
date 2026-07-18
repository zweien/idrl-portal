-- API key rate limiting via DB counters (shared across instances).
-- rateLimitPerMin: per-key limit; NULL means use the global default (60).
-- rlWindowStart / rlCount: current 60s window start + consumed count,
-- incremented atomically (UPDATE ... WHERE) so concurrent requests can't
-- under-count.
ALTER TABLE "ApiKey" ADD COLUMN "rateLimitPerMin" INTEGER;
ALTER TABLE "ApiKey" ADD COLUMN "rlWindowStart" DATETIME;
ALTER TABLE "ApiKey" ADD COLUMN "rlCount" INTEGER NOT NULL DEFAULT 0;
