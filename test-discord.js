const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');

async function test() {
  const config = JSON.parse(fs.readFileSync('sessions/discord-config.json', 'utf8'));
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  client.once('ready', async () => {
    console.log('Logged in as ' + client.user.tag);
    
    // Guild ID from previous check
    const guildId = '1087798193284186203';
    let guild;
    try {
        guild = await client.guilds.fetch(guildId);
    } catch (e) {
        console.log('Could not fetch guild by ID ' + guildId);
        process.exit(1);
    }

    console.log('Connected to guild: ' + guild.name);
    
    const channels = await guild.channels.fetch();
    // Look for "chat" channel
    const chatChannel = channels.find(c => c && c.name && c.name.toLowerCase().includes('chat') && c.type === ChannelType.GuildText);
    
    if (!chatChannel) {
      console.log('Channel containing "chat" not found. Available text channels: ' + channels.filter(c => c && c.type === ChannelType.GuildText).map(c => c.name).join(', '));
      process.exit(1);
    }
    
    await chatChannel.send('hi');
    console.log('Sent "hi" to ' + guild.name + ' / ' + chatChannel.name);
    process.exit(0);
  });

  await client.login(config.token);
}

test().catch(console.error);
