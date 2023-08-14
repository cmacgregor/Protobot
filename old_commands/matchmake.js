//Command handler for matchmake command
exports.run = async (client, message, args) => {
    if(!args || args.length < 2) return message.reply("Must provide game and player limit to matchmake.");
    message.channel.send("Matchmaking " + args[0] + " for " + message.author).catch(console.error);

    //check for matchmaking parent channel 
    // const categortyChannel = getCategoryChannel(client.config.categoryChannelName, message.guild);
    console.log("Checking for matchmaking category channel in server: " + message.guild);
    let categoryChannel = message.guild.channels.find(c => c.name === client.config.categoryChannelName);
    if(!categoryChannel)
    {   
        console.log("Creating matchmaking category channel in server: " + message.guild);
        //matchmaking category didn't exist so we create it
        let categoryChannel = message.guild.createChannel(client.config.categoryChannelName, 'category');
    }
        
    //search for possible channel matches
    //TODO:
    //if not matches were found create a channel 
    // let matchmakingChannel = createMatchmakingChannel(categoryChannel, args[0], args[1], message.guild);
    // console.log(matchmakingChannel.name);
    console.log("Creating matchmaking channel in " + message.guild + " for " + args[0] + " with " + args[1] + " players");
    categoryChannel.guild.createChannel(args[0] + "/" + args[1], "voice").then(
        (chan) => {
            chan.setParent(categoryChannel.id);
        }
    ).catch(console.error);

    // matchmakeChannel.setParent(categoryChannel.id);

    //move use to that channel
    // message.author.setVoiceChannel(matchmakingChannel);
};

function getCategoryChannel(categoryChannelName, server)
{
	console.log("Checking for matchmaking category channel in server: " + server.name);
    let categoryChannel = server.channels.find(c => c.name === categoryChannelName);
	if(!categoryChannel)
	{   
        console.log("Creating matchmaking category channel in server: " + server.name);
		//matchmaking category didn't exist so we create it
		let categoryChannel = server.createChannel(categoryChannelName, 'category');
    }
    return categoryChannel;
}

function checkForMatchmakingChannels(game, server)
{
    console.log("Checking " + server.name + " server for matching channel");

}

function createMatchmakingChannel(categoryChannel, game, players, server)
{
    console.log("Creating matchmaking channel in " + server.name + " for " + game + " with " + players + " players");
    return categoryChannel.guild.createChannel(game + "/" + players, "voice");
}