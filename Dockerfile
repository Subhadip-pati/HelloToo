FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

RUN npm install
RUN npm install --prefix frontend
RUN npm install --prefix backend

COPY . .

RUN npm run build --prefix frontend

ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

EXPOSE 8787

CMD ["npm", "run", "start", "--prefix", "backend"]
