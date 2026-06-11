FROM node:20-alpine AS base

WORKDIR /usr/src/app

RUN npm install pm2@latest -g

FROM base AS deps

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runner

ENV NODE_ENV=production
ENV DOTENV_CONFIG_PATH=/usr/src/app/.env
ENV PM2_HOME=/usr/src/app/.pm2

RUN apk add --no-cache wget \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001 -G nodejs

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .

RUN mkdir -p /usr/src/app/.pm2 \
    && chown -R nodejs:nodejs /usr/src/app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
