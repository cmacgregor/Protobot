const { SlashCommandBuilder } = require('discord.js')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raffle')
        .setDescription('Pick a winner of the raffle from users in the same voice chat as the caller'),
        async execute(interaction) {
            let responseMessage = `You must be in a voice channel to raffle`;
            const voiceChannel = interaction.guild.members.cache.get(interaction.member.user.id).voice.channel; 
            
            if(voiceChannel)
            {
                const voiceChannelMembers = voiceChannel.members;
                console.log(voiceChannelMembers.size);
                const winningMember = voiceChannelMembers.at(Math.floor(voiceChannelMembers.size * Math.random()));
                
                responseMessage = `${winningMember.user} won ${interaction.user}'s Raffle`;
            }
            await interaction.reply(responseMessage);
        }
}