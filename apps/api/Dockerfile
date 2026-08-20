FROM node:20-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/ads/package.json packages/ads/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN npm install
COPY . .
RUN npm run build -w @streaming/api
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@streaming/api"]
