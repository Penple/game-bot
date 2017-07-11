const config = require("../config.json")

const Discord = require("discord.js");
const client = new Discord.Client();

const express = require('express');
const app = express();

const rp = require('request-promise').defaults({ json: true });

// TODO Cleanup spaghetti code in this function... later.
app.get('/callback', async function (req, res) {
  const token = await rp({
    method: 'POST',
    uri: 'https://discordapp.com/api/oauth2/token',
    formData: {
      code: req.query.code,
      grant_type: "authorization_code",
      client_id: config.client_id,
      redirect_uri: config.redirect_url,
      client_secret: config.client_secret
    }
  })
  const auth = `${token.token_type} ${token.access_token}`;
  console.log(auth);

  const user = await rp({
    method: 'GET',
    uri: 'https://discordapp.com/api/users/@me',
    headers: {
      "Authorization": auth
    }
  })
  console.log(user);

  const connections = await rp({
    method: 'GET',
    uri: 'https://discordapp.com/api/users/@me/connections',
    headers: {
      "Authorization": auth
    }
  })

  const guild = client.guilds.get(req.query.state);
  if (!guild) return res.status(400).send('Invalid input.');
  const member = guild.members.get(user.id);
  if (!guild.members.get) res.status(400).send('Invalid input.');

  const response = (await rp({
    method: 'GET',
    uri: 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/',
    qs: {
      "key": config.steam_api_key,
      "steamid": connections.find(connection => { return connection.type === "steam" }).id,
      "format": "json",
      "include_appinfo": "1"
    }
  })).response;
  const guildRoles = guild.roles.array();
  const roles = [];
  for (game of response.games) {
    const role = guild.roles.array().find(role => role.name === `🎮 ${game.name}`);
    if (role && !member.roles.has(role.id)) {
      roles.push(role);
    }
  }
  member.addRoles(roles);
  res.send('Your Steam games have been synced to discord.');
})

app.listen(80, function () {
  console.log('Web listening!');
})

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async msg => {
  if (msg.content === '-sync') {
    msg.reply(`Please link your Steam account to your discord then visit https://discordapp.com/oauth2/authorize?client_id=${config.client_id}&scope=identify%20connections&redirect_uri=${encodeURIComponent(config.redirect_url)}&response_type=code&state=${msg.guild.id}`);
  } else if (msg.content.startsWith("-addgame ") && msg.member.hasPermission("ADMINISTRATOR")) {
    const arg = msg.content.substring(9);
    if (isNaN(arg)) return msg.reply("that's not a valid game id.");
    const response = (await rp({
      method: 'GET',
      uri: 'http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/',
      qs: {
        "key": config.steam_api_key,
        "appid": arg,
        "format": "json"
      }
    }));
    if (response === undefined) return msg.reply("Steam sent back nothing, that either means the game is in early access, or it doesn't exist.")
    if (msg.guild.roles.array().find(role => role.name === `🎮 ${response.game.gameName}`)) return msg.reply(`${response.game.gameName} already has a game role!`)
    msg.guild.createRole({ name: `🎮 ${response.game.gameName}` })
      .then(role => {
        msg.reply(`\`${role.name}\` role has been created.`)
      })
      .catch(err => {
        msg.reply("the role was unable to be created. Check the bot's permissions and retry.");
      });
  } else if (msg.content == "-optout") {
    msg.member.removeRoles(msg.guild.roles.array().filter(role => role.name.startsWith("🎮 ")));
    msg.reply("all game ranks have been removed, -sync to add them back.")
  } else if (msg.content == "-list") {
    const roleArray = msg.guild.roles.array().filter(role => role.name.startsWith("🎮 "));
    msg.reply("```Diff\n+Games:\n" + roleArray.map((role, index) => `- ${index + 1}) ${role.name.substring(3)}`).join("\n") + "```");
  } else if (msg.content.startsWith("-join ")) {
    const roleArray = msg.guild.roles.array().filter(role => role.name.startsWith("🎮 "));
    arg = msg.content.substring(6);
    if (isNaN(arg)) return msg.reply("please type the id of a role in -list.");
    const role = roleArray[arg - 1];
    if (!role) return msg.reply("please type the id of a role in -list.");
    if (msg.member.roles.has(role.id)) return msg.reply("you already have that role.");
    msg.member.addRole(roleArray[arg - 1]);
    msg.reply(`given role \`${role.name}\`.`)
  } else if (msg.content.startsWith("-leave ")) {
    const roleArray = msg.guild.roles.array().filter(role => role.name.startsWith("🎮 "));
    arg = msg.content.substring(6);
    if (isNaN(arg)) return msg.reply("please type the id of a role in -list.");
    const role = roleArray[arg - 1];
    if (!role) return msg.reply("please type the id of a role in -list.");
    if (!msg.member.roles.has(role.id)) return msg.reply("you don't have that role.");
    msg.member.removeRole(role);
    msg.reply(`taken role \`${role.name}\`.`)
  } else if (msg.content === "-privacy") {
    const roleArray = msg.guild.roles.array().filter(role => role.name.startsWith("🎮 "));
    arg = msg.content.substring(6);
    msg.reply(`this bot retrieves Steam profile data to sync steam roles to Discord. No data is stored long-term on the server.`)
  } else if (msg.content === "-help") {
    msg.reply("```" +
              "-sync    Syncs your Steam games to Discord.\n" +
              "-optout  Remove game roles\n" +
              "-list    Lists all game roles\n" +
              "-join    Join a game role in the list\n" +
              "-leave   Leave a game role\n" +
              "-addgame Add a steam game by ID\n" +
              "-privacy Read the bot's privacy policy" +
              "```");
  }
});

client.login(config.bot_token);
