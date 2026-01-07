# À construire depuis la racine du monorepo : docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/grades/package.json packages/grades/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@climb-coach/web..."
COPY packages/grades packages/grades
COPY apps/web apps/web
RUN pnpm --filter "@climb-coach/web..." build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
