FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY packages/core/package.json packages/core/package.json
COPY services/worker/package.json services/worker/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY services/worker services/worker
RUN npm run build -w packages/core && npm run build -w services/worker

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/services/worker/dist ./services/worker/dist
CMD ["node", "services/worker/dist/worker.js"]
