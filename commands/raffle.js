const { GuildMember } = require("discord.js");

exports.run = (client, message, args) => {
  var raffleTextChannel = "none";
  var winner = "";
  var raffleCandidateArr = [];

  //get raffle text channel
  raffleTextChannel = message.guild.channels.find(
    (channel) => channel.id === client.config.raffleTextChannelId
  );
  if (!raffleTextChannel) {
    raffleTextChannel = message.channel;
  }

  //get user id's from raffle voice channel
  var rafflerChannel = message.guild.channels.find(
    (channel) => channel.id === client.config.raffleVoiceChannelId
  );
  var rafflers = Array.from(rafflerChannel.members);

  //rafflers = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  var winningIndex = Math.floor(Math.random() * rafflers.length);

  var winner = rafflers[winningIndex];

  console.log(rafflers);
  console.log("Users in raffle: " + rafflers.length);
  console.log(winningIndex);
  console.log("Index: " + winningIndex + ": " + rafflers[winningIndex]);
  console.log(winner);
  raffleTextChannel
    .send(raffleTextChannel.send(`${winner} wins!`))
    .catch(console.error);
};
