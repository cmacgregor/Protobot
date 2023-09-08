# Protobot
Discord bot for the BloodRedSakura Community discord. (twitch.tv/bloodredsakura)
As well as my own learning.

#Setup
1. Register your application/bot with discord
2. Create and populate a .env file in the root directory of this project
    CLIENT_ID - bot application Id from discord portal
    GUILD_ID  - development server id
    TOKEN     - Discord bot secret token

#Usage
Run node deploy-commands.js to register "/" commands with discord 
Run node bot.js to start the bot from the command line

#Roadmap
- Raffle function to @ a random person in a configured voice channel
   - Used to pick activities like movie night
- Raffle setup function to configure the channel the person is chosen from
