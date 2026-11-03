FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY apps/api/package*.json ./
RUN npm install
COPY apps/api/ ./
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
