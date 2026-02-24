FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY packages/core/package.json packages/core/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY services/api services/api
RUN npm run build -w packages/core && npm run build -w services/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=4000
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/services/api/dist ./services/api/dist
EXPOSE 4000
CMD ["node", "services/api/dist/server.js"]
