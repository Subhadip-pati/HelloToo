# HelloToo Public Launch

HelloToo can be made available to all users on the internet, but that requires public hosting. It cannot be launched globally only from a local PC session without a public server or deployment account.

## Ready Now

This repo is prepared for public hosting with:

- `Dockerfile`
- `render.yaml`
- root `npm run build`
- root `npm run start`
- Render health check at `/health`

The backend already serves the built frontend, so one public web service is enough.

## Fastest Public Option: Render

### 1. Push the project to GitHub

Push this full repo to a GitHub repository.

### 2. Create the Render service

In Render:

1. Click `New +`
2. Choose `Blueprint`
3. Connect your GitHub repo
4. Select this repo
5. Render will read `render.yaml`

### 3. Confirm the important settings

Render should use:

- Service type: `Web Service`
- Runtime: `Docker`
- Port: `8787`
- Health check path: `/health`
- Persistent disk mount: `/var/data`

### 4. Set environment values

Use these values:

- `NODE_ENV=production`
- `PORT=8787`
- `HOST=0.0.0.0`
- `DATABASE_URL=file:/var/data/dev.db`
- `JWT_SECRET=<long random secret>`
- `CORS_ORIGIN=https://your-render-url.onrender.com`

If you later connect a custom domain, update `CORS_ORIGIN` to that final public URL.

### 5. Deploy

After deploy finishes:

1. Open `https://your-render-url.onrender.com/health`
2. Confirm it returns `{"ok":true}`
3. Open the root app URL
4. Register and test chat from another device

## Optional Production Email OTP

If you want email OTP in production, also set:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Important Notes

- The app currently uses SQLite.
- For public multi-user use, persistent disk storage is required.
- `render.yaml` already mounts a disk at `/var/data`.
- Keep `JWT_SECRET` private.
- The free plan may sleep when inactive.

## Docker Run Example

```bash
docker build -t helloto .
docker run -p 8787:8787 \
  -e JWT_SECRET="replace-with-a-long-secret" \
  -e CORS_ORIGIN="https://your-domain.com" \
  -e DATABASE_URL="file:/data/dev.db" \
  -v helloto-data:/data \
  helloto
```

## What I Could Not Do From Here

I prepared the app for public deployment, but I did not actually publish it to a public host because that requires your hosting account, repo access, and internet deployment credentials.
