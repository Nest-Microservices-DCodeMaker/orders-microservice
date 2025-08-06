FROM node:22-alpine3.21
WORKDIR /usr/src/app

COPY package*.json ./

COPY prisma ./prisma

RUN npm install

COPY . .

EXPOSE 3000