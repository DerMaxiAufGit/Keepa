# Keepa — Runbook

## Deployment

### Docker (recommended)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — set DISCORD_TOKEN, CLIENT_ID, POSTGRES_PASSWORD

# 2. Build and start
docker compose up -d

# 3. Register slash commands (first time or after command changes)
npm run deploy
# Or run inside the container:
# docker compose exec keepa node src/deploy-commands.js
```

### Manual

```bash
# 1. Install PostgreSQL 16+ and create a database
createdb keepa

# 2. Install dependencies
npm ci --omit=dev

# 3. Configure environment
cp .env.example .env
# Edit .env

# 4. Register slash commands
node src/deploy-commands.js

# 5. Start
node src/index.js
```

## Infrastructure

<!-- AUTO-GENERATED:infra -->
| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | `postgres:16-alpine` | `127.0.0.1:5433:5432` | PostgreSQL database |
| `keepa` | Built from `Dockerfile` | — | Discord bot (Node.js 22) |
<!-- /AUTO-GENERATED:infra -->

- **Volumes**: `pgdata` (Postgres data), `./logs` (bot log files)
- **Restart policy**: `unless-stopped` for both services
- **Health check**: Postgres readiness via `pg_isready -U keepa` (5 s interval)

## Logs

The bot uses [winston](https://github.com/winstonjs/winston) for logging. Log files are written to `./logs/` and mounted into the container.

| Level | When to use |
|-------|-------------|
| `error` | Unrecoverable failures, DB errors |
| `warn` | Recoverable issues, missing optional config |
| `info` | Startup, command executions, key events |
| `debug` | SQL queries, detailed handler flow |

Change the level at runtime via the `LOG_LEVEL` environment variable.

## Common Issues

### Bot does not start

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Missing required environment variables` | `.env` not present or incomplete | Copy `.env.example` and fill required values |
| `ECONNREFUSED ...5432` | Postgres not running or wrong host | Run `docker compose up -d postgres` or check `DATABASE_URL` |
| `TokenInvalid` | Wrong or expired bot token | Regenerate token in the Discord Developer Portal |

### Slash commands not showing

- Run `npm run deploy` after adding or modifying commands.
- Guild-scoped commands (using `GUILD_ID`) appear instantly; global commands can take up to 1 hour.

### Temp channels not cleaned up

- Verify the cron job is running (check logs for cron start messages at boot).
- Ensure the bot has `ManageChannels` permission.

### Mutes not expiring

- The cron job in `src/cron.js` checks for expired mutes every minute.
- Confirm the `mute_role` is configured via `/config mute-role`.

## Rollback Procedure

1. **Stop the current bot**: `docker compose down keepa`
2. **Revert code**: `git checkout <previous-tag>`
3. **Rebuild**: `docker compose up -d --build keepa`
4. **Verify**: check `docker compose logs -f keepa` for clean startup.

> **Database**: The schema uses `IF NOT EXISTS` — rolling back code will not drop new columns/tables. If a migration added breaking schema changes, restore from a Postgres backup.

## Backup

```bash
# Database backup
docker compose exec postgres pg_dump -U keepa keepa > backup_$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U keepa keepa
```
