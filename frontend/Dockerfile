# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
# Next.js rewrites are resolved at build time, so the backend URL is a build arg.
ARG API_URL=http://backend:4000
ENV API_URL=$API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: minimal standalone server ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
