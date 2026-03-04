FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
RUN addgroup -S keepa && adduser -S keepa -G keepa
USER keepa
CMD ["node", "src/index.js"]
