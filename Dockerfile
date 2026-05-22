FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --only=production && \
    npm cache clean --force

FROM node:20-alpine AS client-builder

WORKDIR /app

COPY client/package.json ./

RUN npm install && npm cache clean --force

COPY client/ ./

RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tzdata ca-certificates

ENV TZ=Asia/Shanghai

COPY --from=builder /app/node_modules ./node_modules
COPY server.js .
COPY --from=client-builder /app/dist ./client/dist
COPY data ./data

EXPOSE 3000

CMD ["node", "server.js"]
