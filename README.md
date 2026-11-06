# Protobot
Discord bot for the BloodRedSakura Community discord. (www.twitch.tv/bloodredsakura)
As well as my own learning.

## Commands
| Command | Who | What it does |
|---|---|---|
| `/watchparty name url` | Anyone | Starts a watchparty: posts the link with a TMDB poster and records who watches (see below). Pick the title from the suggestions to link it to TMDB |
| `/endwatchparty` | Host, or anyone in the party's voice channel | Ends the watchparty in this channel now |
| `/importsheet` | Server owner | Imports the existing Google Sheets log into the database, matching old usernames to current members. Safe to re-run |
| `/exportmovies [rescan]` | Server owner | Scans the channel for movie links posted since the last export and appends them to Google Sheets |
| `/raffle` | Anyone | Picks a random member of your current voice channel |
| `/info user\|server` | Anyone | Basic user or server info |
| `/reload command` | Server owner | Reloads a command from disk without restarting |
| `/ping` | Anyone | Pong |

## Watchparties
Watchparty records live in a SQLite database (`data/protobot.db`). If Google Sheets is configured, each party is also written there as one row when it ends, using the title's TMDB name.

- **Attendance** is tracked from voice joins and leaves in the host's voice channel while the party runs. Anyone there for at least half of it counts as having watched. Bots are ignored.
- **Ending:** movies end at their TMDB runtime plus 15 minutes. Any party ends once its voice channel has been empty for 10 minutes (recorded as the time everyone left), with `/endwatchparty`, when a new party starts in the same channel, or after 8 hours. The bot posts a summary of who watched.
- **Restarts:** active parties are picked back up when the bot comes online. A party whose runtime ran out while the bot was offline is closed at the time it should have ended.
- **Weekly movie night:** a party started while a Discord scheduled event is live in that voice channel is tagged with the event.

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
| `GOOGLE_SHEETS_SPREADSHEET_ID` | For Sheets | Target spreadsheet. Writes to `Sheet1`, columns A–K: Title, URL, Posted Date, Service, Genre, Rewatch Count, Runtime, Host, Start Attendees, End Attendees, Type |
| `DB_PATH` | No | Database file (default `./data/protobot.db`) |

### Running directly
Requires Node 22.13+ (for the built-in `node:sqlite`; it logs an "experimental" warning at startup, which is expected).
```sh
npm install
npm run deploy   # register slash commands with Discord
npm start        # start the bot
npm run lint
npm test
```
Pull requests run lint and tests in CI, and the Docker image is only published when they pass.

### Running in Docker
- The GitHub Action builds `ghcr.io/cmacgregor/protobot` for amd64 and arm64 on every push to `main`
- Copy `docker-compose.example.yml` to `docker-compose.yml` and provide your `.env`
- Mount `./data` (as in the example). It holds the watchparty database, so without it records are lost when the container is recreated

## Roadmap
- `/history` and `/stats`: what we've watched, genres, attendance, rewatches
- Ratings (1–10) prompted when a watchparty ends
- `/recommend` based on the group's ratings, skipping what's been watched
- Raffle setup command to configure which voice channel is raffled on
- CD GitHub Action to deploy to the Docker host
