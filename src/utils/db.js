const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let pool;

function getPool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

const VALID_CONFIG_COLUMNS = new Set([
  'prefix', 'mod_log_channel', 'member_log_channel', 'message_log_channel',
  'voice_log_channel', 'server_log_channel', 'welcome_channel', 'welcome_message',
  'welcome_enabled', 'welcome_embed', 'goodbye_channel', 'goodbye_message',
  'goodbye_enabled', 'mute_role', 'auto_roles', 'verification_role', 'min_account_age',
  'anti_raid_enabled', 'anti_raid_threshold', 'anti_raid_window',
  'phishing_filter', 'invite_filter', 'invite_filter_action', 'nsfw_filter',
  'spam_enabled', 'spam_threshold', 'mention_enabled', 'mention_threshold',
  'caps_enabled', 'caps_threshold',
]);

const CONFIG_QUERIES = {};
for (const col of VALID_CONFIG_COLUMNS) {
  CONFIG_QUERIES[col] = `UPDATE guild_config SET ${col} = $1 WHERE guild_id = $2`;
}

async function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  pool = new Pool({ connectionString });

  pool.on('error', (err) => logger.error('Unexpected pool error:', err));

  // NOTE: Schema is re-executed on every startup. All DDL must be idempotent
  // (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, etc.).
  // CHECK constraints in CREATE TABLE IF NOT EXISTS only apply when the table
  // is first created. Consider a migration tool for non-idempotent changes.
  const schema = await fs.promises.readFile(
    path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'
  );
  await pool.query(schema);

  logger.info('Database initialized (PostgreSQL)');
  return pool;
}

async function query(text, params) {
  if (!pool) throw new Error('Database not initialized');
  return pool.query(text, params);
}

const GUILD_CONFIG_COLUMNS = `guild_id, prefix, mod_log_channel, member_log_channel, message_log_channel,
  voice_log_channel, server_log_channel, welcome_channel, welcome_message,
  welcome_enabled, welcome_embed, goodbye_channel, goodbye_message, goodbye_enabled,
  mute_role, auto_roles, verification_role, min_account_age,
  anti_raid_enabled, anti_raid_threshold, anti_raid_window,
  phishing_filter, invite_filter, invite_filter_action, nsfw_filter,
  spam_enabled, spam_threshold, mention_enabled, mention_threshold,
  caps_enabled, caps_threshold`;

async function getGuildConfig(guildId) {
  const { rows } = await query(
    `SELECT ${GUILD_CONFIG_COLUMNS} FROM guild_config WHERE guild_id = $1`,
    [guildId]
  );
  if (rows.length > 0) return rows[0];
  await query('INSERT INTO guild_config (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING', [guildId]);
  const result = await query(
    `SELECT ${GUILD_CONFIG_COLUMNS} FROM guild_config WHERE guild_id = $1`,
    [guildId]
  );
  return result.rows[0];
}

async function setGuildConfig(guildId, key, value) {
  if (!VALID_CONFIG_COLUMNS.has(key)) {
    throw new Error(`Invalid config column: ${key}`);
  }
  await getGuildConfig(guildId);
  const sql = CONFIG_QUERIES[key];
  await query(sql, [value, guildId]);
}

module.exports = { init, query, getPool, getGuildConfig, setGuildConfig };
