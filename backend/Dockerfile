# ---- build stage: compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage: production deps only ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
# generate the Prisma client against the runtime node_modules
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# apply committed migrations, then start (seed runs inside the app, idempotent)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
