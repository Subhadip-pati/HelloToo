# Implementation Notes - OTP-Based 2FA Authentication

## Overview
Successfully implemented OTP-based 2FA (email + SMS) authentication for HelloTo Node.js/Express app, replacing password-based registration/login.

## Key Changes

### 1. PhoneOtp Table Integration
- `issuePhoneOtp()`: Now correctly uses `prisma.phoneOtp.create()` instead of `emailOtp`
- `verifyPhoneOtp()`: Now correctly queries `prisma.phoneOtp` instead of `emailOtp`
- Both functions properly track OTP consumption with `consumedAt` field
- Database indexes support fast lookups by (phoneNumber, purpose, expiresAt)

### 2. New Registration System
```
/auth/register/request-otp → /auth/register/verify
```
- Sends email OTP with purpose "verify-email"
- Sends SMS OTP with purpose "verify-phone"
- Both OTPs must be valid to create account
- New users auto-get `emailVerified=true` and `phoneVerified=true`
- Random password hash prevents password-based login
- Username auto-generated if not provided

### 3. New Login System
```
/auth/login/request-otp → /auth/login/verify
```
- Sends email OTP with purpose "login"
- Sends SMS OTP with purpose "login-phone"
- Finds user by email OR phone
- Both OTPs must be valid to complete login
- Access checks prevent blocked/suspended/deleted accounts

### 4. Backward Compatibility
- Legacy `/auth/register` (password) still works
- Legacy `/auth/login` (password) still works
- Marked with comments indicating deprecation
- Existing users can continue with password auth

## Database Schema

### PhoneOtp Model
```prisma
model PhoneOtp {
  id         String   @id @default(cuid())
  userId     String?
  phoneNumber String
  codeHash   String
  purpose    String
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())

  @@index([phoneNumber, purpose, expiresAt])
}
```

### OTP Purposes
**EmailOtp:**
- "verify-email", "login", "reset-password", "reset-pin"
- "admin-login", "admin-reset-password", "admin-reset-pin", "admin-change-credentials"

**PhoneOtp:**
- "verify-phone", "login-phone", "reset-password-phone", "reset-pin-phone"

## Validation Schemas

### registerOtpRequestSchema
```json
{
  "email": "string (email)",
  "phoneNumber": "string (7-20 chars)",
  "username": "string (2-30 chars, optional)",
  "name": "string (2-50 chars)"
}
```

### registerOtpVerifySchema
```json
{
  "email": "string (email)",
  "phoneNumber": "string (7-20 chars)",
  "emailOtp": "string (exactly 6 digits)",
  "phoneOtp": "string (exactly 6 digits)",
  "username": "string (2-30 chars, optional)",
  "name": "string (2-50 chars)",
  "avatarUrl": "string (url or data:image, optional)",
  "bio": "string (max 160 chars, optional)",
  "statusText": "string (max 80 chars, optional)"
}
```

### loginOtpRequestSchema
```json
{
  "email": "string (email)",
  "phoneNumber": "string (7-20 chars)"
}
```

### loginOtpVerifySchema
```json
{
  "email": "string (email)",
  "phoneNumber": "string (7-20 chars)",
  "emailOtp": "string (exactly 6 digits)",
  "phoneOtp": "string (exactly 6 digits)"
}
```

## Rate Limiting
- Applied to all auth routes via `authRateLimit` middleware
- Limit: 40 attempts per 15 minutes per IP
- Returns 429 status with Retry-After header

## Error Handling

### Registration Errors
```
400 - Invalid input (validation failed)
400 - Invalid or expired email OTP
400 - Invalid or expired phone OTP
403 - Email reserved for admin
409 - Email already registered
409 - Phone already registered
429 - Too many requests (rate limited)
```

### Login Errors
```
400 - Invalid OTP or OTP expired
403 - Email reserved for admin / Account blocked/suspended
404 - User not found
429 - Too many requests (rate limited)
```

## Security Features

### OTP Security
- OTPs hashed with bcrypt (cost factor 8) before storage
- Both email AND phone verification required
- OTPs expire after 10 minutes (configurable via OTP_MINUTES)
- OTPs consumed after first verification (marked with consumedAt)
- No OTP reuse possible

### Account Security
- Admin emails reserved and protected
- Access error checking for blocked/suspended/deleted accounts
- Rate limiting prevents brute force
- All auth events audited with timestamps and actors
- Passwords not required for OTP-registered users

### Admin Protection
- Admin emails cannot be used for regular registration
- Admin panel redirects regular users appropriately

## Development Mode

### Console Output
```
[DEV OTP] verify-email for user@example.com: 123456
[DEV PHONE OTP] verify-phone for +1234567890: 654321
[DEV OTP] login for user@example.com: 654321
[DEV PHONE OTP] login-phone for +1234567890: 123456
```

### API Preview OTPs
When delivery fails in development, API responses include:
```json
{
  "emailOtpSent": false,
  "phoneOtpSent": false,
  "devEmailOtpPreview": "123456",
  "devPhoneOtpPreview": "654321"
}
```

## Environment Configuration

### Required for SMS
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890
```

### Required for Email
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

### Already Present
```env
DATABASE_URL=file:./prisma/helloto.db
JWT_SECRET=your-secret
PORT=8787
HOST=0.0.0.0
```

## Code Locations

### Core Functions
- `makeOtpCode()` (line ~618)
- `sendSms()` (line ~622)
- `issueOtp()` (line ~753)
- `issuePhoneOtp()` (line ~822) **FIXED**
- `verifyOtp()` (line ~840)
- `verifyPhoneOtp()` (line ~852) **FIXED**

### Validation Schemas
- Lines 193-222 (new schemas added)

### Routes
- `POST /auth/register/request-otp` (line ~938) **NEW**
- `POST /auth/register/verify` (line ~966) **NEW**
- `POST /auth/login/request-otp` (line ~1020) **NEW**
- `POST /auth/login/verify` (line ~1051) **NEW**
- `POST /auth/register` (line ~1083) - Legacy
- `POST /auth/login` (line ~1144) - Legacy

## Testing Recommendations

### Unit Tests
- [ ] OTP generation creates 6-digit strings
- [ ] OTP hashing works correctly
- [ ] OTP comparison validates correctly
- [ ] Expired OTPs rejected
- [ ] Consumed OTPs rejected

### Integration Tests
- [ ] Full registration flow with valid OTPs
- [ ] Full login flow with valid OTPs
- [ ] Invalid OTP rejected
- [ ] Expired OTP rejected
- [ ] Duplicate email rejected
- [ ] Duplicate phone rejected
- [ ] Admin email rejected
- [ ] Rate limiting enforced
- [ ] Blocked user rejected
- [ ] Suspended user rejected

### Manual Testing
- Test with dev OTPs in console
- Test with real Twilio account (if configured)
- Test with real SMTP account (if configured)
- Test rate limiting behavior
- Test error messages are helpful
- Test JWT token works for subsequent requests

## Migration Path

### For Existing Users
1. Keep password authentication working
2. Users can optionally add OTP verification
3. Users can migrate at their own pace

### For New Users
1. Use OTP-based registration only
2. No password option at signup
3. Faster onboarding (no password requirements)

### For API Clients
1. Continue using old endpoints if preferred
2. Gradually migrate to new OTP endpoints
3. Test both flows during transition

## Monitoring

### Metrics to Track
- OTP generation success rate
- Email delivery success rate
- SMS delivery success rate
- Registration completion rate
- Login success rate
- Failed OTP attempts
- Rate limit hits
- Average time to verify

### Alerts to Set
- OTP delivery failures > 5%
- Registration abandonment > 30%
- Rate limit hits spike
- Expired OTP usage attempts

## Future Enhancements

### Possible Improvements
1. Custom OTP expiration times per use case
2. Resend OTP endpoint
3. OTP verification status endpoint
4. Multi-channel OTP (WhatsApp, Telegram)
5. Backup OTP codes for lost devices
6. OTP length customization
7. Rate limiting per user instead of per IP
8. OTP delivery telemetry

## Known Limitations

1. Both email and phone required (no optional channels)
2. OTP length fixed at 6 digits
3. OTP expiration fixed at 10 minutes
4. Rate limiting per IP (not per user)
5. No OTP resend endpoint
6. No backup OTP codes

## Troubleshooting

### SMS Not Sending
1. Check TWILIO_ACCOUNT_SID is set
2. Check TWILIO_AUTH_TOKEN is valid
3. Check TWILIO_FROM_NUMBER is valid
4. Check phone number format (+1234567890)
5. Check Twilio account has credits
6. Check console for [DEV PHONE OTP] logs

### Email Not Sending
1. Check SMTP_HOST is set
2. Check SMTP_PORT is correct (usually 587)
3. Check SMTP_USER and SMTP_PASS are valid
4. Check SMTP_FROM is set
5. Check firewall allows SMTP outbound
6. Check console for [DEV OTP] logs

### User Can't Register
1. Check email is valid format
2. Check phone is valid format (7-20 chars)
3. Check email not reserved for admin
4. Check email not already registered
5. Check phone not already registered
6. Check rate limiting not exceeded
7. Check OTP was entered correctly
8. Check OTP not expired (10 min max)

## Deployment Checklist

- [ ] Database migrated with PhoneOtp model
- [ ] Backend code deployed
- [ ] TWILIO_ACCOUNT_SID configured
- [ ] TWILIO_AUTH_TOKEN configured
- [ ] TWILIO_FROM_NUMBER configured
- [ ] SMTP credentials configured
- [ ] Email templates tested
- [ ] SMS templates tested
- [ ] Rate limiting monitored
- [ ] Error tracking enabled
- [ ] Analytics tracking enabled
- [ ] Frontend updated to use new endpoints
- [ ] User documentation updated
- [ ] Support team trained
- [ ] Rollback plan prepared
- [ ] Monitoring alerts set up

## Support

For questions or issues:
1. Check console logs for [DEV OTP] / [DEV PHONE OTP]
2. Review error response messages
3. Check rate limiting hasn't been exceeded
4. Verify Twilio/SMTP credentials
5. Check Prisma schema matches PhoneOtp model
6. Review audit events for debugging

---

**Implementation Date:** 2024
**Status:** Complete and Ready for Testing
**Files Modified:** backend/src/index.ts
**Backward Compatibility:** Maintained
**Breaking Changes:** None
