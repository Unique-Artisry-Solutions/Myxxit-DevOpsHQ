FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install --omit=dev

COPY server.mjs ./
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/data && \
    chmod +x /app/scripts/bootstrap-auth.mjs

ENV HOST=0.0.0.0 \
    PORT=4311 \
    DATA_DIR=/app/data \
    NODE_ENV=production

EXPOSE 4311

CMD ["node", "server.mjs"]
