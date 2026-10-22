FROM node:24-bookworm-slim
ENV NODE_ENV=production CONTROL_BIND=127.0.0.1 CONTROL_DATABASE=/data/control.sqlite
WORKDIR /app
# Control uses only Node builtins; no Playwright, Mongo driver or browser on the VPS.
COPY --chown=node:node remote-control.js ./
COPY --chown=node:node src/remote ./src/remote
COPY --chown=node:node control-web ./control-web
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
CMD ["node", "remote-control.js"]
