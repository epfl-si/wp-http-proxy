# https://nodejs.org/en/docs/guides/nodejs-docker-webapp/
FROM node:latest

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production

RUN mkdir /etc/proxy-cache
ENV PROXY_CONFIG_FILE /etc/proxy-cache/config.js

COPY . .
CMD [ "npm", "start" ]
