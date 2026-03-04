# Code Review Report — Keepa Discord Bot

**Date:** 2026-03-04
**52 files changed** | **+1,308 / -866 lines** | SQLite to PostgreSQL migration + security hardening

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 6 | BLOCK |
| HIGH | 11 | WARN |
| MEDIUM | 10 | INFO |
| LOW | 8 | NOTE |
| **Total** | **35** | |

**Verdict: BLOCK — 6 CRITICAL issues must be resolved before merge.**

### Top 5 highest-impact fixes

1. **C1** — Broken transactions in `buttonrole.js` (data corruption risk)
2. **C2** — Missing auth on ticket add/remove (privilege escalation)
3. **C3** — Unhandled DB errors after mod actions (stuck interactions + missing records)
4. **H2** — Transcript channel never used (bug — wrong SELECT columns)
5. **H5** — Fire-and-forget unbans (permanent bans from failed auto-unban)

---

## CRITICAL (6) — Must fix before merge

### C1: Broken transaction pattern in buttonrole.js

**File:** `src/commands/roles/buttonrole.js:100-112`

`query()` calls `pool.query()` which uses arbitrary pool connections. `BEGIN`/`COMMIT`/`ROLLBACK` execute on different connections, providing zero atomicity. Partial inserts persist on failure, and the user receives a false success reply.

```js
// BROKEN — each query() goes to a different pool connection
const client = await query('BEGIN');
try {
  for (const btn of buttons) {
    await query('INSERT INTO component_roles ...');
  }
  await query('COMMIT');
} catch (err) {
  await query('ROLLBACK');
}
```

**Fix:** Acquire a dedicated `pool.connect()` client for transactions, or add a `withTransaction(fn)` helper to `db.js`:

```js
const pgClient = await pool.connect();
try {
  await pgClient.query('BEGIN');
  for (const btn of buttons) {
    await pgClient.query('INSERT INTO component_roles ...', [...]);
  }
  await pgClient.query('COMMIT');
} catch (err) {
  await pgClient.query('ROLLBACK');
  logger.error(`Button role DB error: ${err.message}`);
  return interaction.reply({
    embeds: [errorEmbed('DB Error', 'Panel was posted but roles could not be saved.')],
    ephemeral: true
  });
} finally {
  pgClient.release();
}
```

---

### C2: Missing authorization on `/ticket add` and `/ticket remove`

**File:** `src/commands/tickets/ticket.js:49-68`

`isOwner`, `hasManageChannels`, and `hasSupportRole` are computed but only enforced for the `assign` sub-command. Any ticket participant can add/remove arbitrary users — privilege escalation within Discord channel permissions.

**Fix:** Add the permission guard to `add` and `remove`:

```js
if (sub === 'add') {
  if (!isOwner && !hasManageChannels && !hasSupportRole) {
    return interaction.reply({
      embeds: [errorEmbed('No Permission', 'Only the ticket owner or staff can add users.')],
      ephemeral: true
    });
  }
  // ...
}
```

---

### C3: Unhandled DB rejection after Discord action

**Files:** `src/commands/moderation/ban.js:55`, `kick.js:37`, `mute.js:46`, `warn.js:26`

The `await query(INSERT ...)` call after the Discord action (ban/kick/mute/warn) is not wrapped in try/catch. If the query fails, the Discord action has already executed but no infraction record exists and no reply is sent — the moderator sees a stuck "thinking..." spinner.

**Fix:** Wrap the infraction insert in try/catch with a partial-success reply:

```js
let caseId = '?';
try {
  const result = await query('INSERT INTO infractions ...', [...]);
  caseId = result.rows[0].id;
} catch (err) {
  logger.error(`Failed to record infraction for ${user.id}: ${err.message}`);
  return interaction.reply({
    embeds: [errorEmbed('Partial Failure', 'User was actioned but the infraction could not be recorded (DB error).')],
    ephemeral: true,
  });
}
```

---

### C4: TOCTOU race condition in delinfraction.js

**File:** `src/commands/moderation/delinfraction.js:15-19`

SELECT checks `active = 1` but the subsequent UPDATE does not re-check it. Between the two queries, another moderator could deactivate the same infraction.

**Fix:** Collapse to a single atomic UPDATE and check rowCount:

```js
const { rowCount } = await query(
  'UPDATE infractions SET active = 0, deleted_by = $1 WHERE id = $2 AND guild_id = $3 AND active = 1',
  [interaction.user.id, caseId, interaction.guildId]
);
if (rowCount === 0) {
  return interaction.reply({
    embeds: [errorEmbed('Not Found', `Case #${caseId} not found or already deleted.`)],
    ephemeral: true
  });
}
```

---

### C5: Functional default password in .env.example

**File:** `.env.example:7-8`

`CHANGE_ME` creates a working but insecure deployment if copied as-is. Docker Compose will initialize the database with this password and the app will connect successfully, giving no indication of misconfiguration.

**Fix:** Use a non-functional placeholder and add a startup assertion:

```env
DATABASE_URL=postgresql://keepa:<your-password>@localhost:5432/keepa
POSTGRES_PASSWORD=             # Set a strong password here
```

---

### C6: Schema re-executed on every startup without migration support

**File:** `src/utils/db.js:32-35`

The entire `schema.sql` is sent via `pool.query()` on every boot. `CREATE TABLE IF NOT EXISTS` is safe, but new CHECK constraints won't apply to existing tables, and any non-idempotent future DDL (ALTER TABLE, CREATE INDEX) will crash the bot on second startup.

**Fix:** Use a migration tool (e.g., `node-pg-migrate`) or at minimum document this as a known limitation and ensure all DDL statements are idempotent.

---

## HIGH (11) — Should fix before merge

### H1: Automod cache never invalidated on writes

**File:** `src/handlers/automodHandler.js:8-85`

The `automodCache` Map caches filter rules for 60s TTL. The filter and automod command handlers write to the database but never invalidate the cache. A moderator adding an urgent word filter during a raid sees no effect for up to 60 seconds.

**Fix:** Export an `invalidateAutomodCache(guildId, key?)` function and call it from write paths in `filter.js` and `automod.js`:

```js
function invalidateAutomodCache(guildId, key = null) {
  if (key) {
    automodCache.get(guildId)?.delete(key);
  } else {
    automodCache.delete(guildId);
  }
}
module.exports = { runAutomod, invalidateAutomodCache };
```

---

### H2: Ticket transcript channel never used (wrong SELECT columns)

**File:** `src/handlers/ticketHandler.js:97`

`SELECT support_roles FROM ticket_config` only fetches one column, but line 114 accesses `config.transcript_channel`, which is always `undefined`. Transcripts are never sent to the log channel.

**Fix:**

```js
const { rows: configRows } = await query(
  'SELECT support_roles, transcript_channel FROM ticket_config WHERE guild_id = $1',
  [interaction.guildId]
);
```

---

### H3: HTML-escaped URLs break attachment links in transcripts

**File:** `src/handlers/ticketHandler.js:158`

`escapeHtml(a.url)` converts `&` to `&amp;` inside `href` attributes. Discord CDN URLs contain `&` in query parameters, so all attachment links in transcripts are broken.

**Fix:** Don't HTML-escape URLs in href attributes (they are bot-controlled, not user input):

```js
`<a href="${a.url}">${escapeHtml(a.name || 'attachment')}</a>`
```

---

### H4: Process error handlers registered too late

**File:** `src/index.js:26-27`

`process.on('unhandledRejection')` is registered inside the async IIFE, after `await initDb()`. If `initDb()` rejects, the rejection is unhandled and the process exits with no logged error.

**Fix:** Register process handlers synchronously before the async IIFE:

```js
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err));

(async () => {
  await initDb();
  // ...
})();
```

---

### H5: Fire-and-forget unban in cron job

**File:** `src/cron.js:22-24`

`guild.members.unban()` is not awaited. On failure, the infraction is still marked `active = 0` and the user remains permanently banned with no retry. Same pattern exists for temp role removal.

**Fix:**

```js
try {
  await guild.members.unban(inf.user_id, 'Temp ban expired');
  await query('UPDATE infractions SET active = 0 WHERE id = $1', [inf.id]);
} catch (err) {
  logger.warn(`Auto-unban failed for ${inf.user_id}: ${err.message}`);
  // Do NOT mark active=0 so the next cron run retries
}
```

---

### H6: No input sanitization on `/tempchannel name`

**File:** `src/commands/management/tempchannel.js:60-68`

User-supplied channel name passed directly to `channel.setName()` without stripping control characters or validating length. The same operation in `ticket.js` and `tempChannelPanelHandler.js` correctly sanitizes.

**Fix:** Apply the same sanitization: strip `[\x00-\x1F\x7F]`, trim, enforce 1-100 chars.

---

### H7: Floating promise in `checkPanelPermission`

**File:** `src/handlers/tempChannelPanelHandler.js:53-62`

`interaction.reply()` is not awaited inside the synchronous function. Causes unhandled rejection warnings in production.

**Fix:** Make the function async and await the reply:

```js
async function checkPanelPermission(interaction, temp) {
  if (!isOwner && !isAdmin && !isMod) {
    await interaction.reply({ content: '...', ephemeral: true });
    return false;
  }
  return true;
}
```

---

### H8: Inconsistent bot-check across mod commands

**Files:** `src/commands/moderation/ban.js:31` vs `kick.js:22`

Ban only blocks banning the bot itself (`user.id === client.user.id`), while kick blocks kicking any bot (`user.bot`). Inconsistent behavior across commands.

**Fix:** Unify the approach — use `user.bot` in all commands to prevent accidental removal of integration bots.

---

### H9: Unhandled DB update after Discord action in unban/unmute

**Files:** `src/commands/moderation/unban.js:29-32`, `unmute.js:33-36`

Same pattern as C3 but for UPDATE queries. If the DB call fails after the Discord action succeeds, the infraction record stays active (stale data).

**Fix:** Wrap in try/catch with a partial-success message.

---

### H10: Duplicated column list in getGuildConfig

**File:** `src/utils/db.js:47-73`

The large SELECT column list appears twice with no difference. Adding a new column requires updating both, with silent breakage if one is missed.

**Fix:** Extract the column list into a constant and reuse it:

```js
const GUILD_CONFIG_COLUMNS = `guild_id, prefix, mod_log_channel, ...`;

async function getGuildConfig(guildId) {
  const { rows } = await query(
    `SELECT ${GUILD_CONFIG_COLUMNS} FROM guild_config WHERE guild_id = $1`, [guildId]
  );
  if (rows.length > 0) return rows[0];
  await query('INSERT INTO guild_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING', [guildId]);
  const result = await query(
    `SELECT ${GUILD_CONFIG_COLUMNS} FROM guild_config WHERE guild_id = $1`, [guildId]
  );
  return result.rows[0];
}
```

---

### H11: Raid auto-unlock uses stale channel snapshot

**File:** `src/events/guildMemberAdd.js:47-72`

The `channels` collection is captured at lockdown time. Channels created during the 10-minute lockdown window are never unlocked by the setTimeout callback.

**Fix:** Re-query `guild.channels.cache` at unlock time instead of closing over the snapshot:

```js
setTimeout(async () => {
  const guild = client.guilds.cache.get(member.guild.id);
  if (!guild) return;
  const currentChannels = guild.channels.cache.filter(c => c.isTextBased());
  for (const [, ch] of currentChannels) {
    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null, Connect: null })
      .catch(err => logger.warn(`Raid unlock failed: ${err.message}`));
  }
}, 600000);
```

---

## MEDIUM (10) — Should address

### M1: All DB errors reported as "already exists"

**Files:** `src/commands/filter/automod.js:50-55`, `filter.js:64-68`

Any database error (connection lost, type mismatch) is caught and reported to the user as "already whitelisted" or "already exists". Masks real failures.

**Fix:** Check `err.code === '23505'` to distinguish unique violations from other errors:

```js
} catch (err) {
  if (err.code === '23505') {
    added.push(`${channel} (already whitelisted)`);
  } else {
    logger.error(`Whitelist insert error: ${err.message}`);
    added.push(`${channel} (error — could not add)`);
  }
}
```

---

### M2: Test sub-command doesn't escape markdown in username

**Files:** `src/commands/management/welcome.js:46-50`, `goodbye.js:47`

The production path in `guildMemberAdd.js` escapes the username with `escapeMarkdown()`. The test path does not, so test output differs from production.

**Fix:** Apply `escapeMarkdown()` in test paths. Extract the function to a shared utility (`src/utils/strings.js`).

---

### M3: `{server}` template not markdown-escaped

**File:** `src/events/guildMemberAdd.js:95-99`

`member.guild.name` is user-controlled (server owners set it) but not escaped before template substitution. A guild name containing `**`, backticks, or `[text](url)` renders unexpectedly.

**Fix:** Apply `escapeMarkdown()` to `member.guild.name`.

---

### M4: `LIMIT 100` not communicated to user

**File:** `src/commands/moderation/infractions.js:20`

Footer shows `Total: ${rows.length} infractions` which displays `100` when there are actually more.

**Fix:** Change footer to `Showing last ${rows.length} infractions (max 100)`.

---

### M5: No length guard on `reason` in DM embeds

**Files:** `src/commands/moderation/ban.js:64`, `kick.js:44`, `mute.js:53`, `warn.js:33`

A very long reason string could push the DM over Discord's 2000-character limit, causing the send to silently fail.

**Fix:** Truncate reason before embedding in DMs/embeds (e.g., max 1000 chars).

---

### M6: No try/catch on channel send in ticketpanel create

**File:** `src/commands/tickets/ticketpanel.js:66`

If the bot lacks SendMessages permission in the target channel, the interaction times out with no user-friendly error.

**Fix:** Wrap in try/catch with an error reply.

---

### M7: INTEGER for boolean columns in PostgreSQL schema

**File:** `src/database/schema.sql`

Columns like `welcome_enabled INTEGER DEFAULT 1` use SQLite conventions. PostgreSQL has native BOOLEAN. Using INTEGER is fragile and will cause type coercion issues over time.

---

### M8: In-memory caches never pruned

**Files:** `src/handlers/automodHandler.js:8`, `client.spamTracker`

Guilds that leave retain entries permanently in memory. Add eviction on `guildDelete` event.

---

### M9: Raid tracker reset allows duplicate lockdown timers

**File:** `src/events/guildMemberAdd.js:74`

After raid lockdown triggers, the tracker resets to empty. A second wave of rapid joins triggers a duplicate lockdown and schedules overlapping unlock timers that race against each other.

---

### M10: `user.tag` deprecated in discord.js v14

**File:** `src/commands/moderation/unban.js:34`

Fallback object manually sets `tag` property. `.tag` is deprecated in discord.js v14; use `.username` consistently.

**Fix:** Remove the manual `tag` field from the fallback object:

```js
const user = await client.users.fetch(userId).catch(() => ({ id: userId, username: userId }));
```

---

## LOW (8) — Nice to fix

### L1: `BOT_NAME` constant exported but never imported

**File:** `src/utils/constants.js`

The string `'Keepa'` is still hardcoded across many files in embed footers. Either integrate the constant everywhere or remove the file.

---

### L2: `filter_links.mode` missing CHECK constraint

**File:** `src/database/schema.sql:44-50`

No constraint on `mode TEXT DEFAULT 'blacklist'`. An invalid value could be inserted via a bug.

**Fix:** Add `CHECK (mode IN ('blacklist', 'whitelist'))`.

---

### L3: `automod_whitelist.type` missing CHECK constraint

**File:** `src/database/schema.sql:155-161`

`type TEXT NOT NULL` has no CHECK constraint. Application handles unknown types silently but DB should enforce validity.

**Fix:** Add `CHECK (type IN ('channel', 'role'))`.

---

### L4: Dockerfile runs as root

**File:** `Dockerfile`

Best practice for Node.js containers is to run as a non-root user.

**Fix:**

```dockerfile
RUN addgroup -S keepa && adduser -S keepa -G keepa
USER keepa
```

---

### L5: No logger import in delinfraction.js

**File:** `src/commands/moderation/delinfraction.js`

DB errors silently swallowed with no contextual logging.

**Fix:** Add `const logger = require('../../utils/logger');` and wrap queries in try/catch.

---

### L6: `escapeMarkdown()` defined locally but needed in 3 files

**File:** `src/events/guildMemberAdd.js:7-9`

Also needed in `welcome.js` and `goodbye.js`. Extract to `src/utils/strings.js` for reuse.

---

### L7: `SELECT *` still used for some tables

**Files:** `tempChannelPanelHandler.js:78`, `tempChannelHandler.js:8`, `ticketHandler.js:10`, `ticket.js:33`

Fragile — adding a column silently changes what the application receives. Use column-specific selects.

---

### L8: Emoji in infraction output

**File:** `src/commands/moderation/infractions.js:35`

Uses `🟢`/`🔴` which is inconsistent with no-emoji coding style policy. Replace with text labels (`Active`/`Inactive`).
