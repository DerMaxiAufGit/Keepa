const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildBans,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.GuildMember,
    ],
  });

  client.commands = new Collection();
  client.inviteCache = new Map();
  client.raidTracker = new Map();
  client.phishingDomains = new Set();
  client.spamTracker = new Map();

  return client;
}

module.exports = { createClient };
