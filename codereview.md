# Code Review Report — Keepa Discord Bot

**Date:** 2026-03-04
**Files reviewed:** 51
**Verdict:** BLOCK — 9 CRITICAL issues must be resolved before merge.

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 9 | BLOCK |
| HIGH | 32 | WARN |
| MEDIUM | 24 | INFO |
| LOW | 20 | NOTE |

---

## CRITICAL Issues

### 1. Weak default database password

**Files:** `.env.example:7-8`, `docker-compose.yml:8`

The compose file uses `${POSTGRES_PASSWORD:-keepa}` — if the env var is missing, the DB starts with a known credential. The example file ships a working connection string with password `keepa`.

```yaml
# BAD
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-keepa}

# FIX — fail-fast if unset
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

```bash
# .env.example — use placeholder
DATABASE_URL=postgresql://keepa:CHANGE_ME@localhost:5432/keepa
POSTGRES_PASSWORD=CHANGE_ME
```

---

### 2. No `.dockerignore` — secrets enter Docker build context

**File:** `Dockerfile`

No `.dockerignore` exists. The prior commit had `COPY .env .env` directly in the Dockerfile. Without `.dockerignore`, `.env`, `node_modules/`, and `.git/` are sent to the Docker daemon on every build.

**Fix:** Create `.dockerignore`:

```
.env
*.env
logs/
data/
node_modules/
*.db
.git/
```

---

### 3. DM sent before action succeeds

**Files:** `src/commands/moderation/ban.js:35-37`, `src/commands/moderation/kick.js:22`

The user receives "you were banned/kicked" via DM before the ban/kick API call is made. If the API call fails, the user got a false notification.

**Fix:** Move DM after the action succeeds:

```js
await interaction.guild.members.ban(user, { ... }); // action first
try { await user.send(`You have been banned...`); } catch {} // DM after
```

---

### 4. No try/catch on Discord API moderation actions

**Files:** `src/commands/moderation/ban.js:39`, `kick.js:23`, `mute.js:30`

If `guild.members.ban()` / `.kick()` / `.timeout()` throws (missing permission, network error), the rejection is unhandled. The infraction is never recorded, and the moderator gets a generic "something went wrong" error.

**Fix:** Wrap the action in try/catch with a specific error reply:

```js
try {
  await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: deleteMessages * 86400 });
} catch (err) {
  return interaction.reply({ embeds: [errorEmbed('Ban Failed', 'Could not ban that user.')], ephemeral: true });
}
```

---

### 5. XSS in HTML transcript — unescaped attachment URLs

**File:** `src/handlers/ticketHandler.js:133`

`escapeHtml` is applied to `author` and `content`, but attachment URLs and names are injected raw into the HTML. An attacker can craft a filename containing `<script>` tags.

```js
// BAD
const attachments = m.attachments.map(a => `<a href="${a.url}">${a.name}</a>`).join(' ');

// FIX
const attachments = m.attachments
  .map(a => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a>`)
  .join(' ');
```

---

### 6. Untrusted `action` value from DB used without validation

**File:** `src/handlers/automodHandler.js:113-134`

The `action` string is read from the `filter_words` table and dispatched via string comparison. No `CHECK` constraint exists on the column. An unrecognised action silently deletes the message without logging.

**Fix:**

```js
const VALID_ACTIONS = new Set(['delete', 'warn', 'mute', 'kick', 'ban']);

async function executeAction(message, action, reason, config, client) {
  if (!VALID_ACTIONS.has(action)) {
    logger.warn(`Unknown automod action "${action}" — defaulting to delete`);
    action = 'delete';
  }
  // ...
}
```

Also add a DB constraint in `schema.sql`:

```sql
action TEXT DEFAULT 'delete' CHECK (action IN ('delete','warn','mute','kick','ban'))
```

---

### 7. Internal DB error message leaked to users

**File:** `src/commands/management/tempchannel.js:47`

The catch block sends `err.message` directly in a Discord embed. Database errors can expose table names, column names, and connection details.

```js
// BAD
} catch (err) {
  return interaction.reply({ embeds: [errorEmbed('Error', err.message)], ephemeral: true });
}

// FIX
} catch (err) {
  logger.error(`tempchannel setup error: ${err.stack}`);
  return interaction.reply({ embeds: [errorEmbed('Error', 'Could not set the hub channel. Please try again.')], ephemeral: true });
}
```

---

### 8. Silent `.catch(() => {})` across all event handlers

**Files:** All event handler files in `src/events/`

Every `channel.send(...)` and `logCh.send(...)` call uses `.catch(() => {})` — completely discarding errors. Permission errors, rate limits, and deleted channels all silently disappear.

**Fix:**

```js
// BAD
logCh.send({ embeds: [embed] }).catch(() => {});

// FIX
logCh.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed in ${logCh.id}: ${err.message}`));
```

---

### 9. Raid tracker mutated in-place

**File:** `src/events/guildMemberAdd.js:29-31`

`tracker.joins.push(now)` mutates the shared Map reference directly. Violates immutability requirements.

**Fix:**

```js
const existing = client.raidTracker.get(member.guild.id) ?? { joins: [] };
const updatedJoins = [...existing.joins.filter(t => now - t < config.anti_raid_window), now];
client.raidTracker.set(member.guild.id, { joins: updatedJoins });
```

---

## HIGH Issues

### 10. SQL column interpolation in `setGuildConfig`

**File:** `src/utils/db.js:52`

```js
await query(`UPDATE guild_config SET ${key} = $1 WHERE guild_id = $2`, [value, guildId]);
```

The `VALID_CONFIG_COLUMNS` whitelist guards this, but the pattern is fragile. If the whitelist is ever bypassed or widened incorrectly, SQL injection becomes possible.

**Fix:** Use a lookup map of pre-built query strings:

```js
const CONFIG_QUERIES = {
  prefix: 'UPDATE guild_config SET prefix = $1 WHERE guild_id = $2',
  mod_log_channel: 'UPDATE guild_config SET mod_log_channel = $1 WHERE guild_id = $2',
  // ... one entry per column
};
```

---

### 11. `client.login()` not awaited

**File:** `src/index.js:21`

```js
client.login(process.env.DISCORD_TOKEN); // Promise not awaited
```

If the token is invalid, the rejection is only caught by the global `unhandledRejection` handler.

**Fix:** `await client.login(process.env.DISCORD_TOKEN);`

---

### 12. No startup validation for required environment variables

**File:** `src/index.js`

`DISCORD_TOKEN` and `DATABASE_URL` are never validated before use.

**Fix:**

```js
const REQUIRED_ENV = ['DISCORD_TOKEN', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
```

---

### 13. No format validation on unban user ID

**File:** `src/commands/moderation/unban.js:15`

Raw string goes directly to Discord API and DB with no format check.

**Fix:**

```js
if (!/^\d{17,20}$/.test(userId)) {
  return interaction.reply({ embeds: [errorEmbed('Invalid ID', 'Please provide a valid Discord user ID.')], ephemeral: true });
}
```

---

### 14. No self-action guard on moderation commands

**Files:** `src/commands/moderation/warn.js`, `ban.js`, `kick.js`, `mute.js`, `unmute.js`

A moderator can warn/ban/kick themselves or target the bot. For `warn`, there is no Discord-enforced guard.

**Fix:**

```js
if (user.id === interaction.user.id) {
  return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot use this action on yourself.')], ephemeral: true });
}
if (user.bot) {
  return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot use this action on a bot.')], ephemeral: true });
}
```

---

### 15. Invalid duration silently becomes permanent ban

**File:** `src/commands/moderation/ban.js:27`

`parseDuration("7days")` returns `null` (invalid format), which is treated the same as "no duration" — a permanent ban. No feedback to the moderator.

**Fix:**

```js
if (durationStr) {
  const duration = parseDuration(durationStr);
  if (duration === null) {
    return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Use formats like `7d`, `24h`, `30m`, or `perm`.')], ephemeral: true });
  }
}
```

---

### 16. Ban duration can overflow INTEGER column

**File:** `src/commands/moderation/ban.js:27,42`, `src/database/schema.sql:59`

`expires_at` is `INTEGER` (32-bit, max 2,147,483,647). A duration like `9999w` produces a value that overflows.

**Fix:** Change `expires_at` to `BIGINT` in the schema, or enforce a max duration.

---

### 17. Unbounded `SELECT *` on infractions

**File:** `src/commands/moderation/infractions.js:17-20`

No `LIMIT` clause. Thousands of infractions = OOM or Discord embed overflow.

**Fix:** Add `LIMIT 100` to the query.

---

### 18. Hard DELETE on infractions — no audit trail

**File:** `src/commands/moderation/delinfraction.js:19`

```js
await query('DELETE FROM infractions WHERE id = $1 AND guild_id = $2', [caseId, interaction.guildId]);
```

Permanently destroys moderation records with no soft-delete, no confirmation, and no mod log entry.

**Fix:** Use `UPDATE infractions SET active = 0, deleted = 1` and log the deletion.

---

### 19. No permission check on `closeTicket`

**File:** `src/handlers/ticketHandler.js:73-114`

Any member who can see the ticket channel can close it. No check for ticket owner or support role.

**Fix:** Verify the caller is the ticket owner, has support role, or has `ManageChannels`.

---

### 20. No permission check on temp channel modal submission

**File:** `src/handlers/tempChannelPanelHandler.js:176-203`

`handleTempChannelButton` checks permissions, but `handleTempChannelModal` does not. The modal submission is a separate interaction path.

**Fix:** Add `checkPanelPermission(interaction, temp)` at the top of `handleTempChannelModal`.

---

### 21. All bare `catch {}` blocks in automod swallow failures silently

**File:** `src/handlers/automodHandler.js:86, 116, 125, 127, 129`

Mute, kick, ban, warn — all wrapped in `try {} catch {}` with no logging.

**Fix:** Add `logger.warn(...)` in each catch block.

---

### 22. Spam tracker array mutated with `.push()`

**File:** `src/handlers/automodHandler.js:76-82`

```js
timestamps.push(now); // mutates cached array
```

**Fix:**

```js
const recent = [...timestamps, now].filter(t => now - t < 3000);
client.spamTracker.set(key, recent);
```

---

### 23. N+1 database queries per message in automod

**File:** `src/handlers/automodHandler.js:5-17, 27, 38-39`

Every message triggers 3-4 DB queries (whitelist, filter words, link blacklist/whitelist). No caching.

**Fix:** Add per-guild in-memory cache with 30-60s TTL.

---

### 24. Button role style option only works for role1

**File:** `src/commands/roles/buttonrole.js:42`

```js
const style = interaction.options.getString(`style${i === 1 ? '1' : ''}`) || 'primary';
```

For `i > 1`, this reads option `'style'` which doesn't exist. All buttons beyond the first silently default to Primary.

**Fix:** `interaction.options.getString(\`style${i}\`)` — and register `style2`–`style5` options.

---

### 25. Unbounded message fetch loop in transcript generation

**File:** `src/handlers/ticketHandler.js:120-125`

`while (true)` with no iteration cap. Thousands of messages = OOM / timeout.

**Fix:** Add `MAX_BATCHES = 20` (2000 messages cap).

---

### 26. No try/catch on `getGuildConfig` in event handlers

**Files:** 12+ event handler files

Every event handler calls `await getGuildConfig(...)` at the top without a try/catch. A DB blip = the entire event silently fails.

**Fix:** Wrap in try/catch with early return on failure.

---

### 27. `guildMemberAdd.execute` is 125 lines with nesting depth 5

**File:** `src/events/guildMemberAdd.js:7-131`

Handles 6 concerns inline: account age, anti-raid, auto-roles, welcome, member log, invite tracking.

**Fix:** Extract each concern into its own function.

---

### 28. Phishing list fetch — empty response wipes protection

**File:** `src/cron.js:83-91`

If the remote server returns `[]`, `client.phishingDomains` is replaced with an empty Set.

**Fix:**

```js
if (domains.length === 0) {
  logger.warn('Phishing list returned empty — retaining existing list');
  return;
}
```

---

### 29. No error handling on Discord API calls in tempchannel subcommands

**File:** `src/commands/management/tempchannel.js:60-94`

`channel.setName()`, `channel.setUserLimit()`, `channel.permissionOverwrites.edit()` all unwrapped.

**Fix:** Wrap each in try/catch with user-facing error reply.

---

### 30. No compensating delete if stats channel DB insert fails

**File:** `src/commands/management/stats.js:34-47`

If `guild.channels.create()` succeeds but the DB insert fails, a dangling channel exists with no tracking.

**Fix:** Delete the channel in the catch block.

---

### 31. No error handling on `channel.send()` in buttonrole

**File:** `src/commands/roles/buttonrole.js:78-87`

Unhandled rejection if bot lacks permission to send in the target channel. Also, DB inserts are sequential with no transaction — partial failure = corrupt panel state.

**Fix:** Wrap in try/catch; use a transaction for DB inserts.

---

### 32. Button role interaction has no user feedback on error

**File:** `src/events/interactionCreate.js:95-97`

When `member.roles.add/remove` throws, the interaction is left pending with no reply.

**Fix:**

```js
} catch (err) {
  logger.error(`Button role error: ${err.stack}`);
  await interaction.reply({ content: 'Failed to update your role.', ephemeral: true }).catch(() => {});
}
```

---

### 33. No error handling on Discord API calls in ticket.js

**File:** `src/commands/tickets/ticket.js:38,44,51`

`interaction.channel.permissionOverwrites.edit()` and `.delete()` are unwrapped.

---

### 34. Ticket channel rename has no validation

**File:** `src/commands/tickets/ticket.js:56-58`

No length or character validation before `channel.setName()`.

---

### 35. Unvalidated welcome/goodbye message length

**Files:** `src/commands/management/welcome.js:24-26`, `goodbye.js:19`

No `setMaxLength()` on the option. A message exceeding Discord's 4096-char embed limit crashes the handler on every member join.

**Fix:** Add `.setMaxLength(1800)` to the command option.

---

### 36. `JSON.parse(config.auto_roles)` with no error handling

**File:** `src/events/guildMemberAdd.js:66`

Malformed JSON from DB = uncaught exception that terminates the entire `execute()`, skipping welcome message, member log, and invite tracking.

**Fix:** Wrap in try/catch with a safe default.

---

### 37. `guildMemberAdd.js` — `setTimeout` for raid unlock is not persisted

**File:** `src/events/guildMemberAdd.js:55-59`

The timeout reference is never stored. If the bot restarts within 10 minutes of a raid, channels are never unlocked.

**Fix:** Persist the unlock time to DB and handle in cron.

---

### 38. No pool error handler

**File:** `src/utils/db.js:6, 23`

The `pg` Pool emits `error` on idle client failures. Without a listener, Node throws an uncaught exception.

**Fix:** `pool.on('error', (err) => logger.error('Pool error:', err));`

---

### 39. `undici` vulnerability (transitive via discord.js)

**File:** `package.json`

`undici < 6.23.0` — unbounded decompression chain can cause DoS.

**Fix:** Add override: `"overrides": { "undici": ">=6.23.0" }`

---

### 40. Temp channel name not sanitized

**File:** `src/handlers/tempChannelPanelHandler.js:186-190`

Only checks `if (!name)`. No control character stripping or length enforcement.

**Fix:**

```js
const name = interaction.fields.getTextInputValue('name').trim().replace(/[\x00-\x1F\x7F]/g, '');
if (!name || name.length > 100) {
  return interaction.reply({ content: 'Invalid channel name.', ephemeral: true });
}
```

---

### 41. Cron unbounded `SELECT *` queries

**File:** `src/cron.js:11, 32, 50`

Full table scans every minute with no `LIMIT` or column filtering.

---

## MEDIUM Issues

### 42. Moderate logging race condition in mod commands

**Files:** All moderation commands

`getGuildConfig` after `interaction.reply()` — if it throws, the global handler tries to reply on an already-replied interaction.

**Fix:** Wrap the entire post-reply logging block in an IIFE with try/catch.

---

### 43. `SELECT *` used for guild config

**File:** `src/utils/db.js:40, 43`

Fetches all columns. Any future sensitive column is automatically exposed.

**Fix:** Use explicit column lists.

---

### 44. Schema runs on every startup — no migration system

**File:** `src/utils/db.js:25-28`

`CREATE TABLE IF NOT EXISTS` is idempotent, but there's no mechanism for schema evolution (ALTER TABLE, new columns). Consider `node-pg-migrate`.

---

### 45. PostgreSQL port exposed to all interfaces

**File:** `docker-compose.yml:13`

```yaml
ports:
  - "5433:5432"  # binds to 0.0.0.0
```

**Fix:** `"127.0.0.1:5433:5432"` or remove entirely.

---

### 46. `fs.readFileSync` inside async function

**File:** `src/utils/db.js:25-27`

Blocks the event loop during startup. Use `fs.promises.readFile` instead.

---

### 47. Filter list has no row limit

**File:** `src/commands/filter/filter.js:77-78`

`SELECT *` with no `LIMIT` on filter_words and filter_links.

---

### 48. Automod threshold validation missing

**File:** `src/commands/filter/automod.js:123-128`

Caps/spam threshold accepts any integer. Setting to 0 or 1 = every message triggers.

**Fix:** Add `.setMinValue(1).setMaxValue(100)` to the option.

---

### 49. Transcript attachment links expire

**File:** `src/handlers/ticketHandler.js:137-141`

Attachment links point to `cdn.discordapp.com` which expire. Transcripts are not reliable permanent records.

---

### 50. Temp channel name template not validated at config time

**File:** `src/handlers/tempChannelHandler.js:17`

`hub.channel_name` from DB may contain invalid channel name characters. Validated at join time (too late), not at config time.

---

### 51. Invitation stats are public

**File:** `src/commands/management/invites.js:9-10`

`permissions: []` — any member can query any member's invite data.

---

### 52. `parseInt` without radix and NaN guard

**File:** `src/commands/management/invites.js:20`

**Fix:** `parseInt(r.count, 10) || 0`

---

### 53. Reaction role message ID not validated

**File:** `src/commands/roles/reactionrole.js:22`

Free-text string goes directly to `channel.messages.fetch()` with no format check.

---

### 54. `voiceStateUpdate` handlers not error-bounded

**File:** `src/events/voiceStateUpdate.js:9-10`

If `handleVoiceJoin` throws, voice logging is never reached.

---

### 55. `SELECT *` on reaction_roles when only `role_id` needed

**Files:** `src/events/messageReactionAdd.js:10`, `messageReactionRemove.js:10`

---

### 56. Raid auto-unlock via `setTimeout` not persisted

**File:** `src/events/guildMemberAdd.js:55-59`

Covered under HIGH #37. The timeout is also not cancellable.

---

### 57. Two separate cron schedules instead of one

**File:** `src/cron.js:8, 29`

Two `cron.schedule('* * * * *', ...)` jobs. Merge into one.

---

### 58. Runtime `require()` inside conditionals

**File:** `src/events/interactionCreate.js:40, 51`

Move to top of file for clear dependency graph.

---

### 59. Partial user object in `guildMemberRemove`

**File:** `src/events/guildMemberRemove.js:14`

`member.user` can be partial. Use optional chaining like `messageDelete.js` does.

---

### 60. Ticket `close` has no authorization check (command level)

**File:** `src/commands/tickets/ticket.js:26-29`

Any user in the channel can run `/ticket close`. Related to HIGH #19.

---

### 61. Mutation in autorole and ticketpanel

**Files:** `src/commands/management/autorole.js:32,41`, `src/commands/tickets/ticketpanel.js:36`

`roles.push()` and `roles.splice()` mutate the parsed array. Use spread/filter instead.

---

### 62. Transcript `messages.reverse()` mutates array

**File:** `src/handlers/ticketHandler.js:127`

Use `[...messages].reverse()` or `.toReversed()`.

---

### 63. Automod toggle verb assumes "enable"/"disable" ending

**File:** `src/commands/filter/automod.js:131`

Works today but fragile. Document or compute explicitly.

---

### 64. Temp channel modal member fetch without deferring

**File:** `src/handlers/tempChannelPanelHandler.js:216`

`guild.members.fetch()` is a network call. The 3-second interaction window can expire.

**Fix:** `await interaction.deferReply({ ephemeral: true })` before the fetch.

---

### 65. `goodbye_enabled` column missing from schema

**File:** `src/database/schema.sql`

`welcome_enabled` exists but there's no `goodbye_enabled` flag.

---

## LOW Issues

### 66. `created_at` timestamp type inconsistency

**File:** `src/database/schema.sql`

Some tables use `BIGINT`, others use `INTEGER` for timestamps. `INTEGER` caps at 2038.

---

### 67. Empty catch blocks undocumented

**Files:** All moderation commands

`try { await user.send(...); } catch {}` — correct behavior but no comment explaining why.

---

### 68. `created_at` assumed to be Unix seconds

**File:** `src/commands/moderation/infractions.js:32`

Works correctly, but no comment documenting the expected unit.

---

### 69. Hard-coded product name in embeds

**File:** `src/commands/moderation/infractions.js:41`

`Keepa` duplicated across the codebase. Extract to a constant.

---

### 70. Unused `client` parameter

**Files:** `src/events/channelCreate.js:6`, `channelDelete.js:6`

---

### 71. `EmbedBuilder.addFields()` mutation

**Files:** `src/events/guildMemberUpdate.js:24-25`, `guildMemberRemove.js`

Discord.js API requires mutation — acceptable but noted.

---

### 72. `axios` only used for phishing refresh

**File:** `src/cron.js:2`

Consider extracting to `src/utils/phishingList.js`.

---

### 73. Welcome message template doesn't escape markdown

**File:** `src/events/guildMemberAdd.js:76-80`

Usernames with `*`, `_`, `~` cause unintended formatting.

---

### 74. Filter link domain not format-validated

**File:** `src/commands/filter/filter.js:40-43`

**Fix:** `if (!/^[a-z0-9.-]{1,253}$/.test(domain)) return error;`

---

### 75. `automod.js` — no guard when subcommand not in map

**File:** `src/commands/filter/automod.js:120-121`

`entry` is `undefined` if `sub` is not in the map. Throws `TypeError`.

---

### 76. No `.dockerignore` also slows builds

**File:** `Dockerfile`

`node_modules/` and `.git/` enter the build context unnecessarily.

---

### 77. `stats.js` uses `guild.members.cache` without ensuring cache is populated

**File:** `src/commands/management/stats.js:27-28`

Partial cache = undercounted online/bot members.

---

### 78. `goodbye.js` has no toggle/test subcommand

**File:** `src/commands/management/goodbye.js`

`welcome.js` has `toggle` and `test`. `goodbye.js` only has `set`.

---

### 79. `ticketpanel.js` uses `enabled = 1` (integer)

**File:** `src/commands/tickets/ticketpanel.js:43`

PostgreSQL has no native boolean. Document the integer convention.

---

### 80. Magic numbers across codebase

**Files:** `src/commands/roles/temprole.js:36`, `src/handlers/ticketHandler.js:113`

`Math.floor(Date.now() / 1000)` repeated. `5000` (delete delay) unexplained.

**Fix:** Extract `nowUnixSeconds()` helper and named constants.

---

### 81. Moderate `undici` vulnerability details

**File:** `package.json`

GHSA-g9mf-h72j-4rw9: unbounded decompression chain in HTTP responses (DoS). Transitive via `discord.js`.

---

### 82. Automod `entry` undefined guard

**File:** `src/commands/filter/automod.js:120-121`

If `sub` doesn't match the map, `entry.key` throws TypeError.

---

### 83. Filter link domain validation

**File:** `src/commands/filter/filter.js:40-43`

Lowercased but not validated as an actual domain format.

---

### 84. `require()` at module scope vs conditional

**File:** `src/events/interactionCreate.js:40, 51`

Node caches `require()`, but conditional placement makes dependencies hard to trace.

---

### 85. Transcript `messages` variable reassignment style

**File:** `src/handlers/ticketHandler.js:123`

`let messages` reassigned in a loop. Use `const` with `push` for consistency.

---

## Priority Fix Order

1. Create `.dockerignore`
2. Remove default password from `docker-compose.yml`
3. Reorder DM/action in ban/kick commands
4. Wrap Discord API calls in try/catch across all commands
5. Escape attachment URLs in transcript HTML
6. Validate automod action at point of use + DB CHECK constraint
7. Replace empty `.catch(() => {})` with `.catch(err => logger.warn(...))`
8. Add env var validation at startup
9. Add permission checks to `closeTicket` and `handleTempChannelModal`
10. Add caching for automod DB queries
