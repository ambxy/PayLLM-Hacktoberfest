# Public ETHGlobal demo image: app + local Anvil in one disposable sandbox.
FROM ghcr.io/foundry-rs/foundry:stable AS foundry

# Contract and Next.js outputs are platform-neutral; build them natively so
# solc does not run under amd64 emulation on Apple Silicon.
FROM --platform=$BUILDPLATFORM node:24-bookworm AS build
WORKDIR /app
RUN npm install -g pnpm@12.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm contracts:build && pnpm build

# Native modules (better-sqlite3, SWC) are installed for the target platform.
FROM node:24-bookworm AS deps
WORKDIR /app
RUN npm install -g pnpm@12.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Sandboxes are per visitor; the first World login enrolls without a ticket.
ENV WORLD_ENROLL_WITHOUT_TICKET=true
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/artifacts ./artifacts
COPY --from=build /app/.next ./.next
EXPOSE 8080
CMD ["deploy/cloudflare/entrypoint.sh"]
