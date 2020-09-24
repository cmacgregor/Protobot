var fs = require("fs");

exports.run = (client, message, args) => {
    let raffleTextChannel = "none";
    let localClient = client;
    let lastMessage = message;

    //get guild info from the message
    let dirPath = "servers/" + "chungus/"; //+ lastMessage.guild.id;
    let raffleConfigFilePath = dirPath + "raffleConfig.json";
    let ticketsFilePath = dirPath + "tickets.json";

    let raffleConfig = getRaffleConfigInfo(raffleConfigFilePath);

    raffleTextChannel = lastMessage.guild.channels.find(
        (channel) => channel.id === localClient.config.raffleTextChannelId
    );

    if (!raffleTextChannel) {
        raffleTextChannel = lastMessage.channel;
    }

    let rafflers = getRafflers(
        raffleConfig["voiceChannelId"],
        lastMessage.guild.channels
    );
    console.log(rafflers);
    let tickets = getTickets(rafflers, ticketsFilePath);
    console.log(tickets);
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

    // console.log("Users in raffle: " + tickets.length);
    // console.log("Index: " + winningIndex + ": " + winnersId);
    // console.log("Winner: " + winner);
    console.log("<@" + winner + "> wins!");
    raffleTextChannel
        .send(raffleTextChannel.send("<@" + winnersId + "> wins!"))
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

// Use for creating raffleConfig
// if (!fs.existsSync(dirPath)) {
//     fs.mkdirSync(process.cwd() + dirPath, { recursive: true }, (error) => {
//         if (error) {
//             console.error("Error Creating guild directory");
//         }
//     });

//     let filedata = '{}'
//     fs.writeFile(dirPath + 'raffleConfig.json', '', )
// }

function getRafflers(raffleVoiceChannel, guildChannels) {
    //get user id's from raffle voice channel
    var rafflerChannel = guildChannels.find(
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
    fs.writeFile(raffleTickets, jsonString, function (err, data) {
        if (err) {
            return console.log(err);
        }
        if (data) {
            console.log(data);
        }
    });
}
