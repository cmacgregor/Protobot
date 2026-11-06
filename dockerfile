FROM node:22-bookworm-slim

WORKDIR /usr/src/bot

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "bot.js"]
