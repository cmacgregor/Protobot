FROM node:22-bookworm-slim

RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

COPY package.json package-lock.json /usr/src/bot/
RUN npm ci --omit=dev

COPY . /usr/src/bot

CMD ["node", "bot.js"]