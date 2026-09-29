FROM node:22-alpine AS build
WORKDIR /repo
COPY apps/web/package*.json ./apps/web/
RUN npm --prefix apps/web install
COPY apps/web/ ./apps/web/
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm --prefix apps/web run build

FROM nginx:alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
