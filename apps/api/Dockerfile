# syntax=docker/dockerfile:1
# Container image of the AçaIA API (runs on Cloud Run).
# Build from the REPOSITORY ROOT (the npm workspace and its lockfile live there):
#   docker build -f apps/api/Dockerfile -t acaia-api .

# --- Stage 1: install production dependencies only ---------------------------
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Every workspace manifest is needed so `npm ci` can match the lockfile.
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --ignore-scripts: no third-party install scripts run inside our image.
RUN npm ci --omit=dev --workspace apps/api --ignore-scripts && npm cache clean --force

# --- Stage 2: the runtime image (no compilers, no dev dependencies) ----------
FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
COPY apps/api/scripts apps/api/scripts

# Run as the unprivileged "node" user, never as root.
USER node
WORKDIR /app/apps/api
# Cloud Run sends the port in $PORT (8080 by default); config.js reads it.
EXPOSE 8080
CMD ["node", "src/server.js"]
