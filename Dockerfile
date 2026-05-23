FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config and package.json files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/

# Copy source code
COPY . .

# Install dependencies
RUN pnpm install

# Build api-server and dependencies
RUN pnpm --filter @workspace/api-server build

# Remove devDependencies to save space
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /prod/api-server

FROM node:20-alpine AS runner
WORKDIR /app

# Copy production node_modules and build output
COPY --from=builder /prod/api-server ./

ENV NODE_ENV=production
ENV PORT=8080

# Run as non-root user
USER node

# Start application
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
