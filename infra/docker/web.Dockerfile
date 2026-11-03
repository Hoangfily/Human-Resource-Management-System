FROM node:22-alpine AS build
WORKDIR /repo

# Copy workspace definitions
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/web/package*.json ./apps/web/
COPY apps/api/package*.json ./apps/api/

# Copy shared code
COPY packages/shared/ ./packages/shared/

# Install workspace dependencies
RUN npm install

# Copy web source code
COPY apps/web/ ./apps/web/

ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm --workspace=@hr-agent/web run build

FROM nginx:alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
