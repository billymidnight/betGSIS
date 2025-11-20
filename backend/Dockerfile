FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build || true
EXPOSE 4000
CMD ["node", "dist/index.js"]
