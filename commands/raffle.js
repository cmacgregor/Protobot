var fs = require("fs");

exports.run = (client, message, args) => {
    let raffleTextChannel = "none";
    let lastMessage = message;

    //get guild info from the message
    let dirPath = "servers/" + lastMessage.guild.id + "/";
    let raffleConfigFilePath = dirPath + "raffleConfig.json";
    let ticketsFilePath = dirPath + "tickets.json";

    let raffleConfig = getRaffleConfigInfo(raffleConfigFilePath);

    raffleTextChannel = lastMessage.guild.channels.find(
        (channel) => channel.id === client.config.raffleTextChannelId
    );

    if (!raffleTextChannel) {
        raffleTextChannel = lastMessage.channel;
    }

    let rafflers = getRafflers(
        raffleConfig["voiceChannelId"],
        lastMessage.guild.channels
    );

    let tickets = null;

    if (args[0] == "on") {
        tickets = getWeightedTickets(rafflers, ticketsFilePath);
    } else {
        tickets = getUnweightedTickets(rafflers);
    }

    let winningIndex = Math.floor(Math.random() * tickets.length);
    let winnersId = tickets[winningIndex];

    let winner = {};
    rafflers.forEach((participant) => {
        if (participant[0] === winnersId) {
            winner = participant;
        }
    });

    if (args[0] == "on") {
        updateTickets(winnersId, rafflers, ticketsFilePath);
    }

    var winnerText = "No Users in raffle Voice Channel";
    if (winnersId != undefined) {
        winnerText = "<@" + winnersId + "> wins!";
    }

    raffleTextChannel
        .send(raffleTextChannel.send(winnerText))
        .catch(console.error);
};

function getRaffleConfigInfo(raffleConfigFilePath) {
    if (fs.existsSync(raffleConfigFilePath)) {
        let rawData = fs.readFileSync(raffleConfigFilePath);
        return JSON.parse(rawData);
    } else {
        console.log("Couldn't find raffleConfig at " + raffleConfigFilePath);
    }
}

function getRafflers(raffleVoiceChannel, guildChannels) {
    //get user id's from raffle voice channel
    var rafflerChannel = guildChannels.find(
        (channel) => channel.id === raffleVoiceChannel
    );
    return (rafflers = Array.from(rafflerChannel.members));
}

function getUnweightedTickets(participants) {
    //get the current tickets
    var currentTickets = [];

    participants.forEach((participant) => {
        currentTickets.push(participant[0]);
    });

    return currentTickets;
}

function getWeightedTickets(participants, raffleTickets) {
    //get the current tickets
    var currentTickets = getUnweightedTickets(participants);

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

    return allTickets;
}
function getPastParticipants(raffleTickets) {
    var rawTicketData = fs.readFileSync(raffleTickets);
    var ticketHolder = JSON.parse(rawTicketData);
    console.log(ticketHolder);

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
                newRecord.votes = parseInt(newRecord.votes) + 1;
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

    console.log(newTicketRecord);

    jsonString = JSON.stringify(newTicketRecord);

    console.log(jsonString);
    // fs.writeFile(raffleTickets, jsonString, function (err, data) {
    //     if (err) {
    //         return console.log(err);
    //     }
    //     if (data) {
    //         console.log("Write Data: " + data);
    //     }
    // });
}
