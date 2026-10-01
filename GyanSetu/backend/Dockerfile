FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY db ./db
# Packs live on a mounted volume in production (container disks are wiped on redeploy).
RUN mkdir -p storage/packs storage/media && chown -R node:node storage
USER node
EXPOSE 4000
# Run migrations, then start the API
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/src/index.js"]
