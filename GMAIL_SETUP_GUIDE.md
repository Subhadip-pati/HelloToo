# Gmail SMTP Setup Guide

## Quick Setup Steps

### 1. Enable 2-Step Verification (Required for App Password)
- Go to: https://myaccount.google.com/security
- Click on "2-Step Verification"
- Follow Google's setup process

### 2. Generate App Password
- Go to: https://myaccount.google.com/apppasswords
- Select **Mail** as the app
- Select **Windows Computer** (or your device type)
- Click **Generate**
- Google shows a 16-character password like: `xxxx xxxx xxxx xxxx`
- **Copy this password** (without spaces)

### 3. Update .env with Your Credentials
Once you have the App Password, edit `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=dipsubha3333@gmail.com
SMTP_PASS=YOUR_16_CHARACTER_APP_PASSWORD
SMTP_FROM=dipsubha3333@gmail.com
OTP_REAL_DELIVERY_ONLY=true
```

### 4. Restart Backend
The OTP emails will now be sent through Gmail!

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Invalid username/password" | Make sure you're using the App Password, not your Gmail password |
| "2-Step Verification required" | Enable 2-Step Verification at https://myaccount.google.com/security |
| "App Password not found" | Make sure you have 2FA enabled before accessing App Passwords |
| Still getting SMTP errors | Check that SMTP_PORT is 465 (not 587) and SMTP_HOST is smtp.gmail.com |

## Notes
- App Passwords are 16 characters (usually shown with spaces: `xxxx xxxx xxxx xxxx`)
- You need to remove spaces when entering in .env
- This is more secure than using your actual Gmail password
