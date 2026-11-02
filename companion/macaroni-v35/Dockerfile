FROM node:22-bookworm-slim
WORKDIR /opt/macaroni-companion
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
RUN mkdir -p /var/lib/macaroni /run/secrets/macaroni && chown -R node:node /var/lib/macaroni /run/secrets/macaroni /opt/macaroni-companion
USER node
ENV MACARONI_COMPANION_DATA_DIR=/var/lib/macaroni
EXPOSE 47835
CMD ["npm", "start"]
