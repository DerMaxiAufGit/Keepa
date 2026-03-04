# Contributing to Keepa

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL 16+ (or use Docker)
- A Discord bot application ([Discord Developer Portal](https://discord.com/developers/applications))

## Getting Started

```bash
# Clone the repo
git clone <repo-url> && cd keepa

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env — fill in DISCORD_TOKEN, CLIENT_ID, and POSTGRES_PASSWORD at minimum

# Start the database (Docker)
docker compose up -d postgres

# Register slash commands (guild-scoped for dev)
npm run deploy

# Start the bot
npm start
```

## Available Scripts

<!-- AUTO-GENERATED:scripts -->
| Command | Description |
|---------|-------------|
| `npm start` | Start the bot (`node src/index.js`) |
| `npm run deploy` | Register slash commands with Discord (`node src/deploy-commands.js`) |
<!-- /AUTO-GENERATED:scripts -->

## Environment Variables

<!-- AUTO-GENERATED:env -->
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DISCORD_TOKEN` | Yes | Discord bot token | — |
| `CLIENT_ID` | Yes | Discord application client ID | — |
| `GUILD_ID` | No | Guild ID for dev-mode guild-scoped commands | `123456789012345678` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://keepa:secret@localhost:5432/keepa` |
| `POSTGRES_PASSWORD` | Yes | Password used by docker-compose for the DB container | — |
| `LOG_LEVEL` | No | Logging verbosity (default: `info`) | `error`, `warn`, `info`, `debug` |
| `PHISHING_LIST_URL` | No | URL to a JSON phishing-domain list | `https://raw.githubusercontent.com/...` |
| `BOT_STATUS` | No | Bot presence status (default: `online`) | `online`, `idle`, `dnd` |
| `BOT_ACTIVITY` | No | Bot activity text | `Keeping the server safe` |
<!-- /AUTO-GENERATED:env -->

## Project Structure

```
src/
├── index.js                 # Entry point — env validation, init DB, load handlers
├── client.js                # Extended Discord.js client with intents
├── deploy-commands.js       # Slash command registration script
├── cron.js                  # Scheduled tasks (mute expiry, temp roles, stats)
├── commands/
│   ├── config/              # /config — guild settings
│   ├── filter/              # /filter, /automod — word/link/spam filters
│   ├── logging/             # /logs — audit log channels
│   ├── management/          # /welcome, /goodbye, /autorole, /stats, /invites, /tempchannel
│   ├── moderation/          # /ban, /kick, /mute, /warn, /purge, /lock, /infractions
│   ├── roles/               # /reactionrole, /buttonrole, /temprole
│   └── tickets/             # /ticket, /ticketpanel
├── events/                  # Discord gateway event handlers
├── handlers/                # Command loader, event loader, ticket/automod/tempchannel logic
├── utils/                   # db, logger, embeds, permissions, time, constants
└── database/
    └── schema.sql           # PostgreSQL schema (auto-applied on startup)
```

## Code Style

- **Immutability** — create new objects instead of mutating existing ones.
- **Small files** — aim for < 400 lines; extract when a file exceeds 800.
- **No hardcoded values** — use `src/utils/constants.js` or environment variables.
- **Error handling** — always handle errors; never silently swallow.
- **Parameterized queries** — all SQL uses `$1, $2, ...` placeholders via `pg`.

## Adding a New Command

1. Create `src/commands/<category>/<name>.js` exporting `{ data, execute }`.
2. `data` — a `SlashCommandBuilder` definition.
3. `execute(interaction)` — the handler, called by `interactionCreate`.
4. Run `npm run deploy` to register the new command with Discord.

## Adding a New Event

1. Create `src/events/<eventName>.js` exporting `{ name, execute }`.
2. The event handler auto-loader in `src/handlers/eventHandler.js` will pick it up.

## Database Migrations

Schema lives in `src/database/schema.sql` and is applied on every startup via `CREATE TABLE IF NOT EXISTS`. For additive changes, add new tables or columns with `IF NOT EXISTS` / defaults. For destructive changes, write a manual migration script.
