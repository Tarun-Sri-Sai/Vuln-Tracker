# ----- Stage 1: Build -----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json .
RUN npm ci

COPY . .
RUN npm run build --omit=dev

# ----- Stage 2: Runtime -----
FROM nginx:stable-alpine AS runner

COPY --from=builder /app/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html
