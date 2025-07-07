# ----- Stage 1: Build -----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json .
RUN npm ci

COPY . .
RUN npm run build

# ----- Stage 2: Runtime -----
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package*.json .
RUN npm ci --omit=dev

COPY --from=builder /app/dist dist

ENV NODE_ENV=production
CMD ["node", "."]
