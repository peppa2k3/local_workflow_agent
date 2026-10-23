FROM node:24-bookworm-slim
ENV NODE_ENV=production CONTROL_BIND=0.0.0.0 CONTROL_PORT=34800 CONTROL_DATABASE=/data/control.sqlite
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Local Agent Remote Control" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION
WORKDIR /app
# Control uses only Node builtins; no Playwright, Mongo driver or browser on the VPS.
COPY --chown=node:node remote-control.js ./
COPY --chown=node:node src/remote ./src/remote
COPY --chown=node:node control-web ./control-web
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 34800
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "src/remote/healthcheck.js"]
CMD ["node", "remote-control.js"]
