# Protobot
Discord bot for the BloodRedSakura Community discord. (www.twitch.tv/bloodredsakura)
As well as my own learning.

## Commands
| Command | Who | What it does |
|---|---|---|
| `/watchparty name url` | Anyone | Posts an embed in the streaming service's brand color with a TMDB poster, logs the movie and voice-channel attendees to Google Sheets, and records end attendees once the runtime elapses |
| `/endwatchparty` | Anyone in the party's voice channel | Ends the active watchparty early and records final attendees |
| `/exportmovies [rescan]` | Server owner | Scans the channel for movie links posted since the last export and appends them to Google Sheets |
| `/raffle` | Anyone | Picks a random member of your current voice channel |
| `/info user\|server` | Anyone | Basic user or server info |
| `/reload command` | Server owner | Reloads a command from disk without restarting |
| `/ping` | Anyone | Pong |

## Setup
1. Register your application/bot with Discord
2. Create a `.env` file in the project root:

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot secret |
| `CLIENT_ID` | No | Application id (read from the token if omitted) |
| `GUILD_ID` | No | Register commands to one guild (instant) instead of globally |
| `CLEAR_FIRST` | No | `true` clears existing commands before registering |
| `TMDB_API_KEY` | No | Posters, genre and runtime for `/watchparty` and `/exportmovies` |
| `GOOGLE_SHEETS_CREDENTIALS` | For Sheets | Base64-encoded service account JSON |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | For Sheets | Target spreadsheet (writes to `Sheet1`, columns A–J) |

### Running directly
Requires Node 20+.
```sh
npm install
npm run deploy   # register slash commands with Discord
npm start        # start the bot
npm run lint
```

### Running in Docker
- The GitHub Action builds `ghcr.io/cmacgregor/protobot` for amd64 and arm64 on every push to `main`
- Copy `docker-compose.example.yml` to `docker-compose.yml` and provide your `.env`
- Mount `./data` (as in the example) so `/exportmovies` remembers what it has already exported

## Roadmap
- Raffle setup command to configure which voice channel is raffled on
- CD GitHub Action to deploy to the Docker host
- Persist active watchparties across restarts
