FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg redis-server supervisor && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ads/package.json packages/ads/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/video/package.json packages/video/package.json
RUN npm install
COPY . .
ENV NEXT_PUBLIC_API_URL=/api/v1
ENV INTERNAL_API_URL=http://127.0.0.1:4000/api/v1
RUN npm run build -w @streaming/web && npm run build -w @streaming/api && npm run build -w @streaming/worker
COPY docker/supervisord.conf /etc/supervisor/conf.d/streaming.conf
EXPOSE 3000
CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/streaming.conf"]
