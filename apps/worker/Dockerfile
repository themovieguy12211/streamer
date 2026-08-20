FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/video/package.json packages/video/package.json
RUN npm install
COPY . .
RUN npm run build -w @streaming/worker
CMD ["npm", "run", "start", "-w", "@streaming/worker"]
