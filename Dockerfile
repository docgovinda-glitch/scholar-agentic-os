# syntax=docker/dockerfile:1
#
# Two-stage build, sized for Render's FREE web-service plan (see render.yaml).
#
# Why this shape: the free plan spins the instance down after ~15 minutes of
# inactivity, and the next request pays a cold start while the image is pulled
# and the container boots. Cold-start time scales with image size, so the
# runtime stage deliberately carries only `dist/` plus production dependencies
# — no source, no toolchain, no test deps. The previous single-stage build
# kept the entire build toolchain (vite, vitest, typescript, esbuild,
# tailwind) and the full source tree in the shipped image, all of which the
# running server imports exactly none of.
#
# HUSKY=0 is set in both stages: `prepare: husky install` runs on npm install,
# and .dockerignore (correctly) withholds .git, which would otherwise fail or
# warn during the image build. Husky is a local commit hook — it has no role
# inside a container.

# ---------- builder: full toolchain, produces dist/ ----------
# Node 22, not 20. CI already runs the suite on both, and package.json pins
# @types/node ^22, so 20 was the odd one out. It also matters at runtime: Node
# 20 ships no global WebSocket, which crashed anything constructing a Supabase
# client (see server/src/middleware/auth.ts). Both stages move together so the
# build and the runtime cannot diverge.
FROM node:22-alpine AS builder
WORKDIR /app
ENV HUSKY=0

# Vite inlines these at build time — they must be present for `vite build`,
# not merely at runtime. Render forwards same-named env vars as build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Lockfile-exact install, cached independently of source changes.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
# → dist/ (frontend assets, from vite) + dist/server.cjs (from esbuild)
RUN npm run build

# ---------- runtime: dist/ + production deps only ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HUSKY=0

COPY package.json package-lock.json ./
# server.cjs is bundled with --packages=external, so the production
# dependencies it require()s must really exist here.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Drop root. readUsersDb() may create users.json under the app directory on
# first read, so the directory has to stay writable by the running user.
RUN chown -R node:node /app
USER node

EXPOSE 3000
# Invoke node directly rather than via `npm start` — one fewer process in the
# tree, so signals reach the server and shutdown is not swallowed by npm.
CMD ["node", "dist/server.cjs"]
