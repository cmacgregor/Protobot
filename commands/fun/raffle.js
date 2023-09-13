const { SlashCommandBuilder } = require('discord.js')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raffle')
        .setDescription('Pick a winner of the raffle from users in the same voice chat as the caller'),
        async execute(interaction) {
            let responseMessage = `You must be in a voice channel to raffle`;
            const voiceChannelId = interaction.member.voice.Channel;
            if(voiceChannelId)
            {

                const winningUser = voiceChannelId;
                responseMessage = `${winningUser} won ${interaction.user.username}'s Raffle`;
    
            }
            await interaction.reply(responseMessage);
        }
}