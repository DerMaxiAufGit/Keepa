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
  welcome_enabled INTEGER DEFAULT 1,
  welcome_embed INTEGER DEFAULT 0,
  goodbye_channel TEXT,
  goodbye_message TEXT,
  goodbye_enabled INTEGER DEFAULT 1,
  mute_role TEXT,
  auto_roles TEXT DEFAULT '[]',
  verification_role TEXT,
  min_account_age INTEGER DEFAULT 0,
  anti_raid_enabled INTEGER DEFAULT 0,
  anti_raid_threshold INTEGER DEFAULT 10,
  anti_raid_window INTEGER DEFAULT 10,
  phishing_filter INTEGER DEFAULT 1,
  invite_filter INTEGER DEFAULT 0,
  invite_filter_action TEXT DEFAULT 'delete',
  nsfw_filter INTEGER DEFAULT 0,
  spam_enabled INTEGER DEFAULT 0,
  spam_threshold INTEGER DEFAULT 5,
  mention_enabled INTEGER DEFAULT 0,
  mention_threshold INTEGER DEFAULT 5,
  caps_enabled INTEGER DEFAULT 0,
  caps_threshold INTEGER DEFAULT 70,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS filter_words (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  word TEXT NOT NULL,
  action TEXT DEFAULT 'delete' CHECK (action IN ('delete','warn','mute','kick','ban')),
  UNIQUE(guild_id, word)
);

CREATE TABLE IF NOT EXISTS filter_links (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  mode TEXT DEFAULT 'blacklist' CHECK (mode IN ('blacklist', 'whitelist')),
  UNIQUE(guild_id, domain)
);

CREATE TABLE IF NOT EXISTS infractions (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  duration BIGINT,
  expires_at BIGINT,
  active INTEGER DEFAULT 1,
  deleted_by TEXT,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS temp_channels (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  parent_id TEXT,
  control_message_id TEXT,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
  delete_at BIGINT
);

CREATE TABLE IF NOT EXISTS temp_channel_hubs (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_name TEXT DEFAULT '{user}''s Channel',
  channel_limit INTEGER DEFAULT 0,
  category_id TEXT
);

CREATE TABLE IF NOT EXISTS reaction_roles (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  role_id TEXT NOT NULL,
  mode TEXT DEFAULT 'toggle',
  UNIQUE(message_id, emoji)
);

CREATE TABLE IF NOT EXISTS component_roles (
  id SERIAL PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS temp_roles (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_config (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  category_id TEXT,
  log_channel TEXT,
  support_roles TEXT DEFAULT '[]',
  max_open INTEGER DEFAULT 1,
  transcript_channel TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT DEFAULT 'open',
  topic TEXT,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
  closed_at BIGINT
);

CREATE TABLE IF NOT EXISTS invite_tracking (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  invite_code TEXT,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS stats_channels (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  type TEXT NOT NULL,
  template TEXT DEFAULT '{type}: {count}'
);

CREATE TABLE IF NOT EXISTS automod_whitelist (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('channel', 'role')),
  target_id TEXT NOT NULL,
  UNIQUE(guild_id, type, target_id)
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  content TEXT NOT NULL,
  cron TEXT NOT NULL,
  enabled INTEGER DEFAULT 1
);

-- Ticket system: add lifecycle columns (idempotent)
DO $$ BEGIN
  ALTER TABLE tickets ADD COLUMN closed_by TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tickets ADD COLUMN claimed_by TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tickets ADD COLUMN reopened_at BIGINT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ticket_messages (
  guild_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (guild_id, message_type)
);
