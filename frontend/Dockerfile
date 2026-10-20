FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./

ARG VITE_API_BASE
ARG VITE_WS_BASE
ARG VITE_LIVEKIT_URL
ENV VITE_API_BASE=${VITE_API_BASE} \
    VITE_WS_BASE=${VITE_WS_BASE} \
    VITE_LIVEKIT_URL=${VITE_LIVEKIT_URL}
RUN test -n "$VITE_API_BASE" && test -n "$VITE_WS_BASE" && test -n "$VITE_LIVEKIT_URL"
RUN npm run check && npm run build

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/build ./build

EXPOSE 3000
USER node
CMD ["node", "build"]
