FROM node:18-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
COPY src/ ./src/

RUN npm install && node ./node_modules/typescript/bin/tsc

EXPOSE 3721

CMD ["node", "dist/index.js"]
