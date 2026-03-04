# Keepa — Discord Bot Technical Specification

> **Keepa** is a self-hosted, all-in-one Discord server management bot built with **Discord.js v14** and **Node.js**. It covers moderation, auto-moderation, server management, onboarding, logging, role management, tickets, and more. All data is persisted via **SQLite** (via `better-sqlite3`) for simplicity and portability, with optional PostgreSQL support via env flag.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Tech Stack](#2-tech-stack)
3. [Environment Configuration](#3-environment-configuration)
4. [Database Schema](#4-database-schema)
5. [Core Architecture](#5-core-architecture)
6. [Command Reference](#6-command-reference)
7. [Event Handlers](#7-event-handlers)
8. [Feature Specifications](#8-feature-specifications)
9. [Permissions Model](#9-permissions-model)
10. [Error Handling](#10-error-handling)
11. [Deployment](#11-deployment)

---

## 1. Project Structure

```
keepa/
├── src/
│   ├── index.js                  # Entry point
│   ├── client.js                 # Extended Discord.js client
│   ├── deploy-commands.js        # Slash command registration
│   ├── commands/
│   │   ├── moderation/
│   │   │   ├── ban.js
│   │   │   ├── kick.js
│   │   │   ├── mute.js
│   │   │   ├── warn.js
│   │   │   ├── purge.js
│   │   │   ├── slowmode.js
│   │   │   ├── lock.js
│   │   │   └── infractions.js
│   │   ├── management/
│   │   │   ├── tempchannel.js
│   │   │   ├── autorole.js
│   │   │   ├── welcome.js
│   │   │   ├── goodbye.js
│   │   │   ├── backup.js
│   │   │   ├── stats.js
│   │   │   └── invites.js
│   │   ├── roles/
│   │   │   ├── reactionrole.js
│   │   │   ├── buttonrole.js
│   │   │   └── temprole.js
│   │   ├── tickets/
│   │   │   ├── ticket.js
│   │   │   └── ticketpanel.js
│   │   ├── logging/
│   │   │   └── logs.js
│   │   ├── filter/
│   │   │   ├── filter.js
│   │   │   └── automod.js
│   │   └── config/
│   │       └── config.js
│   ├── events/
│   │   ├── ready.js
│   │   ├── guildMemberAdd.js
│   │   ├── guildMemberRemove.js
│   │   ├── messageCreate.js
│   │   ├── messageDelete.js
│   │   ├── messageUpdate.js
│   │   ├── voiceStateUpdate.js
│   │   ├── guildBanAdd.js
│   │   ├── guildBanRemove.js
│   │   ├── channelCreate.js
│   │   ├── channelDelete.js
│   │   ├── roleCreate.js
│   │   ├── roleDelete.js
│   │   ├── interactionCreate.js
│   │   └── guildMemberUpdate.js
│   ├── handlers/
│   │   ├── commandHandler.js
│   │   ├── eventHandler.js
│   │   ├── automodHandler.js
│   │   ├── tempChannelHandler.js
│   │   └── ticketHandler.js
│   ├── utils/
│   │   ├── db.js                 # Database wrapper
│   │   ├── logger.js             # Winston logger
│   │   ├── embeds.js             # Embed builder helpers
│   │   ├── permissions.js        # Permission checks
│   │   ├── time.js               # Duration parsing (1h, 30m, 7d)
│   │   └── paginator.js          # Paginated embeds
│   └── database/
│       ├── schema.sql
│       └── migrations/
├── .env.example
├── package.json
└── README.md
```

---

## 2. Tech Stack

| Package | Version | Purpose |
|---|---|---|
| `discord.js` | `^14.x` | Discord API client |
| `better-sqlite3` | `^9.x` | Default database |
| `pg` | `^8.x` | Optional PostgreSQL driver |
| `winston` | `^3.x` | Logging |
| `node-cron` | `^3.x` | Scheduled tasks (temp bans, temp roles, temp channels) |
| `dotenv` | `^16.x` | Environment config |
| `axios` | `^1.x` | HTTP requests (phishing domain lists) |

**Node.js minimum version:** `18.x`

---

## 3. Environment Configuration

```env
# .env.example

# Required
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=                        # For dev mode (guild-scoped commands)

# Database
DB_TYPE=sqlite                   # sqlite | postgres
DATABASE_URL=./data/keepa.db  # SQLite path OR postgres connection string

# Optional Features
LOG_LEVEL=info                   # error | warn | info | debug
PHISHING_LIST_URL=https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.json

# Presence
BOT_STATUS=online                # online | idle | dnd
BOT_ACTIVITY=Keeping the server safe  # Activity text
```

---

## 4. Database Schema

```sql
-- Guild-level configuration
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT DEFAULT '!',
  mod_log_channel TEXT,
  member_log_channel TEXT,
  message_log_channel TEXT,
  voice_log_channel TEXT,
  server_log_channel TEXT,
  welcome_channel TEXT,
  welcome_message TEXT,
  welcome_embed INTEGER DEFAULT 0,      -- 0=plain, 1=embed
  goodbye_channel TEXT,
  goodbye_message TEXT,
  mute_role TEXT,
  auto_roles TEXT DEFAULT '[]',         -- JSON array of role IDs
  verification_role TEXT,
  min_account_age INTEGER DEFAULT 0,    -- seconds; 0 = disabled
  anti_raid_enabled INTEGER DEFAULT 0,
  anti_raid_threshold INTEGER DEFAULT 10,
  anti_raid_window INTEGER DEFAULT 10,  -- seconds
  phishing_filter INTEGER DEFAULT 1,
  invite_filter INTEGER DEFAULT 0,
  nsfw_filter INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Per-guild word/phrase blacklist
CREATE TABLE IF NOT EXISTS filter_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  word TEXT NOT NULL,
  action TEXT DEFAULT 'delete',         -- delete | warn | mute | kick | ban
  UNIQUE(guild_id, word)
);

-- Per-guild link whitelist/blacklist
CREATE TABLE IF NOT EXISTS filter_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  mode TEXT DEFAULT 'blacklist',        -- blacklist | whitelist
  UNIQUE(guild_id, domain)
);

-- Infractions (warns, mutes, kicks, bans)
CREATE TABLE IF NOT EXISTS infractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  type TEXT NOT NULL,                   -- warn | mute | kick | ban | note
  reason TEXT,
  duration INTEGER,                     -- seconds; NULL = permanent
  expires_at INTEGER,                   -- unix timestamp
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Temp channels
CREATE TABLE IF NOT EXISTS temp_channels (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  parent_id TEXT,                       -- category
  created_at INTEGER DEFAULT (unixepoch()),
  delete_at INTEGER                     -- NULL = delete on empty
);

-- Temp channel trigger hubs
CREATE TABLE IF NOT EXISTS temp_channel_hubs (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_name TEXT DEFAULT '{user}\'s Channel',
  channel_limit INTEGER DEFAULT 0,
  category_id TEXT
);

-- Reaction roles
CREATE TABLE IF NOT EXISTS reaction_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  role_id TEXT NOT NULL,
  mode TEXT DEFAULT 'toggle',           -- toggle | add | remove
  UNIQUE(message_id, emoji)
);

-- Button/select menu roles
CREATE TABLE IF NOT EXISTS component_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  custom_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  label TEXT,
  emoji TEXT,
  mode TEXT DEFAULT 'toggle',
  UNIQUE(message_id, custom_id)
);

-- Temp roles
CREATE TABLE IF NOT EXISTS temp_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Ticket system
CREATE TABLE IF NOT EXISTS ticket_config (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  category_id TEXT,
  log_channel TEXT,
  support_roles TEXT DEFAULT '[]',      -- JSON array
  max_open INTEGER DEFAULT 1,
  transcript_channel TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT DEFAULT 'open',           -- open | closed | deleted
  topic TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  closed_at INTEGER
);

-- Invite tracking
CREATE TABLE IF NOT EXISTS invite_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  invite_code TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Stats channels (live counters)
CREATE TABLE IF NOT EXISTS stats_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  type TEXT NOT NULL,                   -- members | online | bots | roles | channels
  template TEXT DEFAULT '{type}: {count}'
);

-- Scheduled messages
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  content TEXT NOT NULL,
  cron TEXT NOT NULL,
  enabled INTEGER DEFAULT 1
);
```

---

## 5. Core Architecture

### 5.1 Client (`src/client.js`)

Extend `discord.js` Client to attach:
- `client.commands` — `Collection<name, command>`
- `client.db` — database instance
- `client.inviteCache` — `Map<guildId, Map<code, invite>>` for invite tracking
- `client.raidTracker` — `Map<guildId, { joins: timestamp[] }>` for anti-raid

### 5.2 Command Structure

Every command file must export:

```js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('example')
    .setDescription('Example command'),

  // Required permissions to run (Discord permission flags)
  permissions: ['BanMembers'],

  // Bot permissions required
  botPermissions: ['BanMembers'],

  async execute(interaction, client) {
    // implementation
  }
};
```

### 5.3 Duration Parsing (`src/utils/time.js`)

Parse human durations like `10m`, `2h`, `7d`, `1w` into seconds.

```js
parseDuration('10m')  // → 600
parseDuration('2h')   // → 7200
parseDuration('7d')   // → 604800
parseDuration('perm') // → null (permanent)
```

### 5.4 Embed Helpers (`src/utils/embeds.js`)

Standard embed factory functions:

```js
successEmbed(title, description)   // green
errorEmbed(title, description)     // red
infoEmbed(title, description)      // blue
warnEmbed(title, description)      // yellow
modLogEmbed(action, user, mod, reason, duration, caseId)
```

---

## 6. Command Reference

### 6.1 Moderation

#### `/ban <user> [reason] [duration] [delete_messages]`
- Requires: `BanMembers`
- Bans user; if `duration` is set, stores in `infractions` table and auto-unbans via cron
- DMs user before ban with reason
- Logs to mod log channel
- `delete_messages`: `0` | `1` | `7` days of message history

#### `/unban <user_id> [reason]`
- Requires: `BanMembers`
- Unbans by user ID, marks infraction as inactive

#### `/kick <user> [reason]`
- Requires: `KickMembers`
- DMs user, kicks, logs

#### `/mute <user> <duration> [reason]`
- Requires: `ModerateMembers`
- Uses Discord's native timeout (`member.timeout(ms, reason)`)
- Also stores in `infractions` for history

#### `/unmute <user> [reason]`
- Requires: `ModerateMembers`
- Removes timeout

#### `/warn <user> <reason>`
- Requires: `ModerateMembers`
- Inserts warn into `infractions`, DMs user, logs
- Auto-escalation (optional): configure thresholds in `guild_config` (e.g. 3 warns → mute, 5 warns → ban)

#### `/infractions <user>`
- Lists all infractions for a user, paginated (10 per page)
- Shows: case ID, type, reason, moderator, date, active status

#### `/delinfraction <case_id>`
- Removes a specific infraction by ID
- Requires: `Administrator`

#### `/purge <amount> [user] [contains]`
- Requires: `ManageMessages`
- Bulk deletes up to 100 messages
- Optional: filter by user or message content substring
- Only deletes messages < 14 days old (Discord API limit)

#### `/slowmode <channel> <seconds>`
- Requires: `ManageChannels`
- Sets channel slowmode; `0` to disable

#### `/lock <channel> [reason]`
- Requires: `ManageChannels`
- Denies `SendMessages` for `@everyone` in channel

#### `/unlock <channel>`
- Requires: `ManageChannels`
- Restores `SendMessages` permissions

---

### 6.2 Server Management

#### `/tempchannel setup <hub_channel>`
- Designates a voice channel as a "hub"
- When a user joins the hub, a new voice channel is created named `{username}'s Channel`
- Channel is deleted automatically when empty
- Owner can rename/limit their channel via `/tempchannel name` and `/tempchannel limit`

#### `/tempchannel name <name>`
- Renames the user's active temp channel

#### `/tempchannel limit <number>`
- Sets user limit on temp channel (0 = unlimited)

#### `/autorole add <role>`
- Requires: `ManageRoles`
- Adds role to auto-assign list on member join

#### `/autorole remove <role>`
- Removes role from auto-assign list

#### `/autorole list`
- Lists all configured auto-roles

#### `/welcome set <channel> <message>`
- Requires: `ManageGuild`
- Sets welcome channel and message
- Supports variables: `{user}`, `{user.mention}`, `{server}`, `{membercount}`

#### `/welcome test`
- Sends a test welcome message

#### `/welcome toggle`
- Enables or disables the welcome system

#### `/goodbye set <channel> <message>`
- Sets goodbye channel and message
- Variables: `{user}`, `{server}`, `{membercount}`

#### `/stats create <type>`
- Requires: `ManageChannels`
- Creates a voice channel stat counter
- Types: `members` | `online` | `bots` | `channels` | `roles`
- Updates every 10 minutes via cron

#### `/invites <user>`
- Shows how many users a person has invited and via which codes

---

### 6.3 Text & Content Filtering

#### `/filter add <word> [action]`
- Requires: `ManageGuild`
- Adds word to blacklist
- Actions: `delete` | `warn` | `mute` | `kick` | `ban`

#### `/filter remove <word>`
- Removes word from blacklist

#### `/filter list`
- Lists all filtered words/phrases, paginated

#### `/filter links add <domain> <mode>`
- Adds domain to `blacklist` or `whitelist`

#### `/filter links remove <domain>`

#### `/automod invites <enable|disable>`
- Blocks Discord invite links

#### `/automod phishing <enable|disable>`
- Enables phishing/scam link detection using updated domain list

#### `/automod spam <enable|disable> [threshold]`
- Detects message spam (same user sending X messages in Y seconds)
- Default: 5 messages in 3 seconds → auto-mute 5 minutes

#### `/automod mentions <enable|disable> [threshold]`
- Detects mass mentions (default: 5+ mentions in one message)

#### `/automod caps <enable|disable> [threshold]`
- Detects all-caps messages (default: >70% caps, min 10 chars)

---

### 6.4 Logging

#### `/logs set <type> <channel>`
- Requires: `ManageGuild`
- Types: `mod` | `member` | `message` | `voice` | `server`
- Assigns a log channel for each category

#### `/logs disable <type>`
- Disables logging for a category

#### `/logs list`
- Shows all configured log channels

**Logged events:**

| Category | Events |
|---|---|
| `mod` | ban, unban, kick, mute, unmute, warn |
| `member` | join, leave, role change, nickname change |
| `message` | edit, delete, bulk delete |
| `voice` | join, leave, move between channels |
| `server` | channel create/delete/edit, role create/delete/edit |

---

### 6.5 Roles

#### `/reactionrole add <message_id> <emoji> <role>`
- Requires: `ManageRoles`
- Attach reaction role to existing message

#### `/reactionrole remove <message_id> <emoji>`
- Removes reaction role binding

#### `/buttonrole create <channel>`
- Requires: `ManageRoles`
- Interactive setup wizard: add up to 25 role buttons to a new embed
- Each button: label, emoji, role, color (primary/secondary/success/danger)

#### `/temprole give <user> <role> <duration>`
- Requires: `ManageRoles`
- Assigns role for a set duration, then removes via cron

---

### 6.6 Ticket System

#### `/ticketpanel create <channel> [title] [description]`
- Requires: `ManageGuild`
- Posts a ticket panel embed with a "Create Ticket" button

#### `/ticket close [reason]`
- Closes the current ticket channel
- Saves transcript to configured log channel
- Moves channel to closed state (rename to `closed-{id}`)

#### `/ticket add <user>`
- Adds a user to the current ticket channel

#### `/ticket remove <user>`
- Removes a user from the current ticket channel

#### `/ticket assign <user>`
- Assigns a staff member to the ticket (stored in DB)

#### `/ticket rename <name>`
- Renames the ticket channel

#### `/ticketconfig setup`
- Requires: `ManageGuild`
- Interactive config: support roles, category, log channel, max open tickets per user

---

### 6.7 Config

#### `/config view`
- Shows full guild config as embed

#### `/config minaccountage <seconds>`
- Kicks members whose accounts are younger than specified age

#### `/config antiraid <enable|disable> [threshold] [window]`
- Enables anti-raid: if `threshold` joins happen within `window` seconds, automatically locks all channels and alerts mods

#### `/config verificationrole <role>`
- Sets a role required for full server access (for manual verification workflows)

---

## 7. Event Handlers

### `guildMemberAdd`
1. Check `min_account_age` — kick if too young
2. Anti-raid check — increment counter, trigger lockdown if threshold exceeded
3. Assign `auto_roles`
4. Send welcome message to configured channel
5. Log to member log
6. Track invite used (diff invite cache)

### `guildMemberRemove`
1. Send goodbye message
2. Log to member log

### `messageCreate`
1. Ignore bots
2. Run automod pipeline in order:
   - Word filter
   - Link filter
   - Invite filter
   - Phishing filter
   - Spam detection
   - Mention spam
   - Caps filter
3. Each filter: if triggered, execute configured action and log

### `messageDelete` / `messageUpdate`
- Log to message log channel with old/new content and author info

### `voiceStateUpdate`
- Temp channel: if user joins hub → create channel, add to DB
- Temp channel: if user leaves a temp channel and it's empty → delete channel, remove from DB
- Log voice joins/leaves/moves

### `interactionCreate`
- Route slash commands to command handlers
- Route button interactions to: ticket handler, button role handler, paginator
- Route select menu interactions to: select role handler
- Route modal submissions

### `messageReactionAdd` / `messageReactionRemove`
- Look up reaction roles table by message ID + emoji
- Add/remove role accordingly

### `guildMemberUpdate`
- Log role changes and nickname changes

### `guildBanAdd` / `guildBanRemove`
- Log to mod log

---

## 8. Feature Specifications

### 8.1 Temp Channels (Detailed)

**Hub setup flow:**
1. Admin runs `/tempchannel setup #join-to-create`
2. Bot stores hub channel ID in `temp_channel_hubs`
3. On `voiceStateUpdate`: if user joins hub channel:
   - Create new voice channel in same category: `{username}'s Channel`
   - Move user into new channel
   - Store in `temp_channels` with `owner_id`
4. On `voiceStateUpdate`: if user leaves a temp channel:
   - Check member count of channel
   - If 0: delete channel, remove from `temp_channels`

**Owner controls** (only works if user is in their own temp channel):
- `/tempchannel name <name>` — rename
- `/tempchannel limit <n>` — user limit
- `/tempchannel lock` — deny @everyone from joining
- `/tempchannel unlock`
- `/tempchannel permit <user>` — allow specific user
- `/tempchannel reject <user>` — deny specific user

### 8.2 Anti-Raid

- Track join timestamps per guild in memory (`client.raidTracker`)
- If X joins within Y seconds (configurable): 
  1. Lock all non-admin channels (deny `SendMessages`, `Connect`)
  2. Alert mods in mod log channel with list of recent joiners
  3. Auto-unlock after 10 minutes (or via `/config antiraid unlock`)

### 8.3 Phishing Filter

- On startup and every 12 hours: fetch fresh domain list from `PHISHING_LIST_URL`
- Cache in memory as a `Set<string>`
- On `messageCreate`: extract all URLs, check each domain against the set
- If match: delete message, warn user, log to mod log

### 8.4 Ticket Transcripts

- On ticket close: iterate all messages in channel (paginated via `channel.messages.fetch`)
- Build HTML file: `ticket-{id}-{username}.html`
- Upload as attachment to transcript log channel
- Include: ticket ID, opener, assigned staff, open/close timestamps, full message history

### 8.5 Invite Tracking

- On `ready`: cache all guild invites per guild (`guild.invites.fetch()`)
- On `guildMemberAdd`: fetch invites again, diff against cache to find used invite
- Store inviter → invitee relation in `invite_tracking`
- `/invites <user>`: count rows where `inviter_id = user.id`

### 8.6 Stats Channels

- Cron runs every 10 minutes
- For each row in `stats_channels`:
  - Fetch live value (guild.memberCount, guild.members.cache.filter(m => !m.user.bot).size, etc.)
  - Edit channel name with template: `Members: 1,234`
- Note: Discord rate-limits channel name edits to 2 per 10 minutes per channel — handle gracefully

---

## 9. Permissions Model

### Bot Required Permissions (invite URL)
```
Administrator  (recommended for full functionality)
```

Or granular:
```
ManageGuild, ManageRoles, ManageChannels, ManageMessages,
BanMembers, KickMembers, ModerateMembers, MuteMembers,
MoveMembers, ViewChannel, SendMessages, EmbedLinks,
AttachFiles, ReadMessageHistory, AddReactions,
UseExternalEmojis, ManageNicknames, ViewAuditLog
```

### Command Permission Checks

In `commandHandler.js`, before executing any command:
1. Check `interaction.memberPermissions.has(command.permissions)`
2. Check `interaction.guild.members.me.permissions.has(command.botPermissions)`
3. If either fails, reply with `errorEmbed` — ephemeral

---

## 10. Error Handling

- All command `execute()` functions wrapped in try/catch
- On error: log via `winston`, reply with generic `errorEmbed` (ephemeral)
- Database errors: log and fail gracefully — never crash the process
- Rate limit handling: listen for `RateLimitError`, back off and retry after `retryAfter` ms
- Unhandled rejections and uncaught exceptions: log and keep process alive

```js
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err));
```

---

## 11. Deployment

### Local / Self-hosted

```bash
git clone https://github.com/yourname/keepa
cd keepa
npm install
cp .env.example .env
# Fill in .env
node src/deploy-commands.js   # Register slash commands
node src/index.js
```

### PM2 (recommended for 24/7)

```bash
npm install -g pm2
pm2 start src/index.js --name keepa
pm2 save
pm2 startup
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY .env .env
CMD ["node", "src/index.js"]
```

```bash
docker build -t keepa .
docker run -d --name keepa --restart unless-stopped keepa
```

### Slash Command Registration

- **Development**: set `GUILD_ID` in `.env` → guild-scoped commands (instant update)
- **Production**: remove `GUILD_ID` → global commands (up to 1 hour propagation)

Run `node src/deploy-commands.js` after any command changes.

---

## Notes for the Code Agent

- Use **Discord.js v14** exclusively. Do not use v13 or older APIs.
- All user-facing responses should use **ephemeral replies** where appropriate (errors, config confirmations).
- All slash command options should use `.setRequired()` correctly — never assume optional params exist.
- **Never store tokens, passwords, or sensitive data in the database** — only IDs and config.
- All database writes should use **prepared statements** (better-sqlite3 supports this natively).
- Respect Discord's **rate limits**: channel edits, bulk deletes, and role assignments should be throttled.
- The `interactionCreate` event handler must respond within **3 seconds** or use `deferReply()` for longer operations.
- Cron jobs (temp bans, temp roles, stats channels) should run in the main process — no separate workers needed at this scale.
- All time-based comparisons should use **Unix timestamps** (seconds) stored as integers in SQLite.
- The bot name is **Keepa** — use this name in all embeds, footers, and log messages.
