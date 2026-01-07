# À construire depuis la racine du monorepo : docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/grades/package.json packages/grades/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@climb-coach/api..."
COPY packages/grades packages/grades
COPY apps/api apps/api
RUN pnpm --filter "@climb-coach/api..." build \
  && pnpm --filter @climb-coach/api deploy --legacy --prod /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
