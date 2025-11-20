FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build || true
EXPOSE 3000
CMD ["npx","serve","-s","dist","-l","3000"]
