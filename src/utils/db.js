const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let db;

function init() {
  const dbPath = process.env.DATABASE_URL || './data/keepa.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migrations for existing databases
  try { db.exec('ALTER TABLE temp_channels ADD COLUMN control_message_id TEXT'); } catch {}

  logger.info('Database initialized');
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function getGuildConfig(guildId) {
  const row = getDb().prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (row) return row;
  getDb().prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
  return getDb().prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
}

function setGuildConfig(guildId, key, value) {
  getGuildConfig(guildId); // ensure row exists
  getDb().prepare(`UPDATE guild_config SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
}

module.exports = { init, getDb, getGuildConfig, setGuildConfig };
