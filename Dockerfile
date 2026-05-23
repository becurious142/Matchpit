FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy workspace config and package.json files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build api-server and dependencies
RUN pnpm --filter @workspace/api-server build

# Remove devDependencies to save space
RUN pnpm --filter @workspace/api-server deploy --prod /prod/api-server

FROM node:20-alpine AS runner
WORKDIR /app

# Copy production node_modules and build output
COPY --from=builder /prod/api-server ./

ENV NODE_ENV=production
ENV PORT=8080

# Run as non-root user
USER node

# Start application
CMD ["node", "dist/index.js"]
