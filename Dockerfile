FROM node:20-bookworm-slim AS api
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-paramiko make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/parser/package.json packages/parser/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY tsconfig*.json ./
COPY packages packages
COPY apps/api apps/api
COPY migrations migrations
COPY scripts scripts
RUN npx tsc -b packages/shared packages/parser apps/api && mkdir -p data/db data/raw/events data/backups logs && chown -R node:node data logs
ENV NODE_ENV=production HOST=0.0.0.0 PYTHON=python3
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","apps/api/dist/server.js"]
