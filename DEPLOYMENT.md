# Deployment guide

This app is split into a frontend and a backend.

## Frontend on Vercel

1. Open Vercel and import the `frontend` directory as the project root.
2. Set the framework to Vite.
3. Build command: `npm install && npm run build`
4. Output directory: `dist`
5. Add environment variable:
   - `VITE_API_URL=https://your-backend-domain.com`

## Backend on Render

1. Import the `backend` directory as the web service.
2. Use the existing `render.yaml` in this folder or configure these settings manually:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
3. Add environment variables from `backend/.env.example`.
4. For production, prefer PostgreSQL instead of SQLite for reliability.

## CORS

Set the backend `CORS_ORIGIN` to your Vercel frontend domain:

```bash
CORS_ORIGIN=https://your-app.vercel.app
```

## Notes

- This app uses Express and Socket.IO, so it does not deploy as a single static Vercel app.
- The frontend talks to the backend through `VITE_API_URL`.
- If the backend uses SQLite in development, it must be kept on a writable filesystem in the host environment.

## Example production config

Frontend env:

```bash
VITE_API_URL=https://helloto-api.onrender.com
```

Backend env:

```bash
PORT=8787
HOST=0.0.0.0
DATABASE_URL=file:./prisma/helloto.db
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://your-app.vercel.app
```
