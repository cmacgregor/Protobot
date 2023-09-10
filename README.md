# Protobot
Discord bot for the BloodRedSakura Community discord. (www.twitch.tv/bloodredsakura)
As well as my own learning.

## Setup
1. Register your application/bot with discord
2. Create and populate a .env file in the root directory of this project
    - DISCORD_TOKEN - Discord bot secret

### Running directly
- Run node deploy-commands.js to register "/" commands with discord
- Run node bot.js to start the bot from the command line

### Running in docker
 - The included github action builds for arm64 and amd64 architechtures  
 - There's an example docker-compose.yml included in the repo
   - You'll have to provide your .env file from the setup section to the containerized application

## Roadmap
- Raffle function to @ a random person in a configured voice channel
  - Used to pick activities like movie night
- Raffle setup function to configure the voice channel that's raffled on
- CD github action to push to docker pi
