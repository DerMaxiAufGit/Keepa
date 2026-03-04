# Keepa

Self-hosted, all-in-one Discord server management bot built with **Discord.js v14** and **Node.js**.

## Features

### Moderation
- `/ban`, `/kick`, `/mute`, `/warn` — with optional duration for temp bans/mutes
- `/unban`, `/unmute` — reverse moderation actions
- `/purge` — bulk delete messages
- `/lock`, `/unlock` — channel lockdown
- `/infractions` — view a user's moderation history
- `/delinfraction` — remove an infraction record

### Auto-Moderation
- `/automod` — spam detection, mass-mention filter, caps filter with configurable thresholds
- `/filter` — word blacklist, link blacklist/whitelist with per-match actions (delete, warn, mute, kick, ban)
- Built-in phishing domain filter (auto-updated from community list)
- Invite link filter

### Server Management
- `/welcome`, `/goodbye` — configurable join/leave messages with embed support and template variables
- `/autorole` — automatically assign roles to new members
- `/stats` — live stat counter channels (member count, bot count, etc.)
- `/invites` — invite tracking
- `/tempchannel` — join-to-create temporary voice channels with owner control panel
- `/config` — server-wide settings (min account age, anti-raid, verification role)

### Role Management
- `/reactionrole` — reaction-based role assignment
- `/buttonrole` — button-based role assignment
- `/temprole` — assign a role for a limited duration

### Tickets
- `/ticket` — create, close, and manage support tickets
- `/ticketpanel` — embed panel with a button to open tickets

### Logging
- `/logs` — configure per-category audit log channels:
  - Mod actions, member join/leave, message edits/deletes, voice state changes, role/channel changes

## Tech Stack

| Package | Purpose |
|---------|---------|
| [discord.js](https://discord.js.org/) v14 | Discord API |
| [pg](https://node-postgres.com/) | PostgreSQL driver |
| [winston](https://github.com/winstonjs/winston) | Logging |
| [node-cron](https://github.com/node-cron/node-cron) | Scheduled tasks (expiry checks, stats refresh) |
| [axios](https://axios-http.com/) | HTTP requests (phishing list) |
| [dotenv](https://github.com/motdotla/dotenv) | Environment configuration |

**Requires:** Node.js >= 18, PostgreSQL 16+

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/DerMaxiAufGit/Keepa.git && cd Keepa
npm install

# 2. Configure
cp .env.example .env
# Fill in DISCORD_TOKEN, CLIENT_ID, and POSTGRES_PASSWORD

# 3. Start database
docker compose up -d postgres

# 4. Register slash commands
npm run deploy

# 5. Run
npm start
```

### Docker (full stack)

```bash
cp .env.example .env   # configure
# IMPORTANT: set DATABASE_URL host to "postgres" (the service name), not "localhost":
#   DATABASE_URL=postgresql://keepa:<your-password>@postgres:5432/keepa
docker compose up -d   # starts both Postgres and the bot
npm run deploy         # register slash commands
```

## Required Permissions

The bot needs these Discord permissions to function fully:

- Manage Channels, Manage Roles, Manage Messages
- Kick Members, Ban Members, Moderate Members
- Send Messages, Embed Links, Attach Files, Read Message History
- Add Reactions, Use External Emojis
- View Audit Log
- Connect (for temp voice channels)

## Documentation

- **[Contributing Guide](docs/CONTRIBUTING.md)** — development setup, project structure, code style
- **[Runbook](docs/RUNBOOK.md)** — deployment, troubleshooting, backups
- **[Technical Spec](keepa-spec.md)** — full feature specification and database schema

## License

Private — all rights reserved.
