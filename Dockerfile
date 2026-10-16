FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY app/server.mjs ./app/server.mjs
COPY netlify/functions/api.mjs ./netlify/functions/api.mjs

EXPOSE 3000

CMD ["node", "app/server.mjs"]
