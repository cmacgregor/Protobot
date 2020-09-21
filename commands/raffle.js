var fs = require("fs");

exports.run = (client, message, args) => {
    var raffleTextChannel = "none";
    var winner = "";
    var localClient = client;
    var lastMessage = message;

    //get guild info from the message 
    var guildInfo = getGuildRaffleInfo(lastMessage.guild.id); 

    raffleTextChannel = lastMessage.guild.channels.find(
        (channel) => channel.id === localClient.config.raffleTextChannelId
    );

    if (!raffleTextChannel) {
        raffleTextChannel = lastMessage.channel;
    }
    //rafflers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    var rafflers = getRafflers(localClient.config.raffleVoiceChannelId);
    var tickets = getTickets(rafflers, localClient.config.raffleTickets);

    var winningIndex = Math.floor(Math.random() * tickets.length);
    var winnersId = tickets[winningIndex];

    var winner = {};
    rafflers.forEach((participant) => {
        if (participant[0] === winnersId) {
            winner = participant;
        }
    });

    if (args[0] == "on") {
        updateTickets(winnersId, rafflers, localClient.config.raffleTickets);
    }
    console.log(args);
    // console.log("Users in raffle: " + tickets.length);
    // console.log("Index: " + winningIndex + ": " + winnersId);
    // console.log("Winner: " + winner);
    raffleTextChannel
        .send(raffleTextChannel.send(`${winner} wins!`))
        .catch(console.error);
};

function getGuildRaffleInfo(guildId){
    
}

function getRafflers(raffleVoiceChannel) {
    //get user id's from raffle voice channel
    var rafflerChannel = lastMessage.guild.channels.find(
        (channel) => channel.id === raffleVoiceChannel
    );
    return (rafflers = Array.from(rafflerChannel.members));
}

function getTickets(participants, raffleTickets) {
    //get the current tickets

    var currentTickets = [];

    participants.forEach((participant) => {
        currentTickets.push(participant[0]);
    });

    var allTickets = currentTickets;
    //get past participants
    var pastTicketHolders = getPastParticipants(raffleTickets);
    pastTicketHolders.forEach((ticketHolder) => {
        if (currentTickets.includes(ticketHolder.id)) {
            for (i = 0; i < ticketHolder.votes; i++) {
                allTickets.push(ticketHolder.id);
            }
        }
    });

    // console.log(allTickets);
    return allTickets;
}

function getPastParticipants(raffleTickets) {
    var rawTicketData = fs.readFileSync(raffleTickets);
    var ticketHolder = JSON.parse(rawTicketData);

    // console.log(ticketHolder);
    return ticketHolder;
}

function updateTickets(winnersId, currentParticipants, raffleTickets) {
    var newTicketRecord = [];

    var currentParticipantsIds = [];
    currentParticipants.forEach((participant) => {
        currentParticipantsIds.push(participant[0]);
    });

    //update the past records
    var pastParticipants = getPastParticipants(raffleTickets);
    pastParticipants.forEach((record) => {
        var newRecord = record;

        if (currentParticipantsIds.includes(newRecord.id)) {
            if (newRecord.id !== winnersId) {
                newRecord.votes = newRecord.votes + 1;
            }
            newTicketRecord.push(newRecord);

            currentParticipantsIds = currentParticipantsIds.filter((id) => {
                return id != newRecord.id;
            });
        }
    });

    currentParticipantsIds.forEach((id) => {
        var newRecord = {
            id: id,
            votes: 1,
        };
        newTicketRecord.push(newRecord);
    });

    jsonString = JSON.stringify(newTicketRecord);
    fs.writeFile(raffleTickets, jsonString, function (
        err,
        data
    ) {
        if (err) {
            return console.log(err);
        }
        if (data) {
            console.log(data);
        }
    });
}
