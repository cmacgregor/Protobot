var fs = require("fs");

const dirBasePath = "servers/";

exports.run = (client, message, args) => {
    let textChannelId = args[0];
    let voiceChannelId = args[1];

    let guildFolder = dirBasePath + message.guild.id + "/";

    if (!fs.existsSync(guildFolder)) {
        fs.mkdir(guildFolder, (error) => {
            if (error) {
                console.error("Error Creating guild directory: " + error);
            }
        });

        let filedata = {
            textChannelId: textChannelId,
            voiceChannelId: voiceChannelId,
        };
        fs.writeFile(
            guildFolder + "raffleConfig.json",
            JSON.stringify(filedata),
            (error) => {
                if (error) {
                    console.error(
                        "Error Creating guild raffleConfig file: " + error
                    );
                }
            }
        );
        filedata = "[]";
        fs.writeFile(guildFolder + "tickets.json", filedata, (error) => {
            if (error) {
                console.error("Error Creating guild ticket file: " + error);
            }
        });
    }
};
