# Deep Shaft: build the static bundle, then serve it with nginx.
#
# Multi-stage so the final image carries no node_modules or source. The game is a single
# static page, so nginx's default configuration is replaced by a small one that serves
# hashed assets with immutable caching and revalidates the app shell.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
