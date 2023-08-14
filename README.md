# Protobot
Prototype discord bot for command testing and deriving more polished feature sets

#Setup
1. Register your application/bot with discord
2. Create and populate a .env file in the root directory of this project
    CLIENT_ID - bot application Id from discord portal
    GUILD_ID  - development server id
    TOKEN     - Discord bot secret token
#Usage
Run node deploy-commands.js to register "/" commands with discord 
Run node bot.js to start the bot from the command line

#Further reading
https://discordjs.guide/#before-you-begin