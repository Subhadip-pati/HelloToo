# OTP-Based Authentication API Guide

## Overview
The backend now supports OTP-based authentication (email + SMS) for registration and login. Both email and phone OTPs must be verified to complete authentication.

## API Endpoints

### Registration Flow

#### 1. Request OTPs for Registration
```http
POST /auth/register/request-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "phoneNumber": "+1234567890",
  "name": "John Doe",
  "username": "johndoe"  // optional, auto-generated if omitted
}
```

**Success Response (200):**
```json
{
  "emailOtpSent": true,
  "phoneOtpSent": true,
  "devEmailOtpPreview": "123456",    // Only in development
  "devPhoneOtpPreview": "654321"     // Only in development
}
```

**Error Responses:**
- `400` - Invalid input (missing required fields, invalid format)
- `403` - Email is reserved for admin
- `409` - Email or phone number already registered

---

#### 2. Verify OTPs and Complete Registration
```http
POST /auth/register/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "phoneNumber": "+1234567890",
  "emailOtp": "123456",
  "phoneOtp": "654321",
  "name": "John Doe",
  "username": "johndoe",          // optional, auto-generated if omitted
  "avatarUrl": "https://...",     // optional
  "bio": "Hello, I'm John",       // optional
  "statusText": "Hey there!"      // optional
}
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id_123",
    "username": "johndoe",
    "name": "John Doe",
    "email": "user@example.com",
    "emailVerified": true,
    "phoneNumber": "+1234567890",
    "phoneVerified": true,
    "avatarUrl": "https://...",
    "bio": "Hello, I'm John",
    "statusText": "Hey there!",
    "isOnline": false
  }
}
```

**Error Responses:**
- `400` - Invalid OTP or OTP expired
- `403` - Email is reserved for admin
- `409` - Email or phone already registered

---

### Login Flow

#### 1. Request OTPs for Login
```http
POST /auth/login/request-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "phoneNumber": "+1234567890"
}
```

**Success Response (200):**
```json
{
  "emailOtpSent": true,
  "phoneOtpSent": true,
  "devEmailOtpPreview": "123456",    // Only in development
  "devPhoneOtpPreview": "654321"     // Only in development
}
```

**Error Responses:**
- `400` - Invalid input
- `403` - Email is reserved for admin / Account is blocked/suspended/deleted
- `404` - User not found

---

#### 2. Verify OTPs and Complete Login
```http
POST /auth/login/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "phoneNumber": "+1234567890",
  "emailOtp": "123456",
  "phoneOtp": "654321"
}
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id_123",
    "username": "johndoe",
    "name": "John Doe",
    "email": "user@example.com",
    "emailVerified": true,
    "phoneNumber": "+1234567890",
    "phoneVerified": true,
    "avatarUrl": "https://...",
    "bio": "Hello, I'm John",
    "statusText": "Hey there!",
    "isOnline": false
  }
}
```

**Error Responses:**
- `400` - Invalid OTP or OTP expired
- `403` - Account is blocked/suspended/deleted
- `404` - User not found

---

## Legacy Endpoints (Backward Compatible)

The old password-based authentication endpoints are still available:

```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "password": "securePassword123",
  "email": "user@example.com",
  "phoneNumber": "+1234567890",
  "avatarUrl": "https://...",
  "bio": "Optional bio",
  "statusText": "Optional status"
}
```

```http
POST /auth/login
Content-Type: application/json

{
  "identifier": "user@example.com",  // email, username, or phone
  "password": "securePassword123"
}
```

---

## Frontend Implementation Example

### Registration with OTP

```javascript
// Step 1: Request OTPs
async function requestRegistrationOtp() {
  const response = await fetch('/auth/register/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      phoneNumber: '+1234567890',
      name: 'John Doe'
    })
  });
  
  const data = await response.json();
  console.log('Email OTP sent:', data.emailOtpSent);
  console.log('Phone OTP sent:', data.phoneOtpSent);
  // In dev: use data.devEmailOtpPreview and data.devPhoneOtpPreview for testing
  
  return data;
}

// Step 2: Verify OTPs and complete registration
async function verifyRegistration(emailOtp, phoneOtp) {
  const response = await fetch('/auth/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      phoneNumber: '+1234567890',
      emailOtp: emailOtp,
      phoneOtp: phoneOtp,
      name: 'John Doe'
    })
  });
  
  const data = await response.json();
  if (response.ok) {
    // Store the token
    localStorage.setItem('authToken', data.token);
    console.log('User created:', data.user);
    return data;
  } else {
    throw new Error(data.error);
  }
}
```

### Login with OTP

```javascript
// Step 1: Request OTPs
async function requestLoginOtp() {
  const response = await fetch('/auth/login/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      phoneNumber: '+1234567890'
    })
  });
  
  const data = await response.json();
  console.log('Email OTP sent:', data.emailOtpSent);
  console.log('Phone OTP sent:', data.phoneOtpSent);
  
  return data;
}

// Step 2: Verify OTPs and complete login
async function verifyLogin(emailOtp, phoneOtp) {
  const response = await fetch('/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      phoneNumber: '+1234567890',
      emailOtp: emailOtp,
      phoneOtp: phoneOtp
    })
  });
  
  const data = await response.json();
  if (response.ok) {
    // Store the token
    localStorage.setItem('authToken', data.token);
    console.log('Logged in as:', data.user.username);
    return data;
  } else {
    throw new Error(data.error);
  }
}
```

---

## Important Notes

### OTP Expiration
- OTPs expire after **10 minutes**
- Once an OTP is verified, it's marked as consumed and cannot be reused
- Request a new OTP if it expires

### Rate Limiting
- Auth endpoints are rate-limited to **40 attempts per 15 minutes** per IP
- Returns `429` with `Retry-After` header if limit exceeded

### Development Mode
- When email/SMS delivery is not configured, OTPs are logged to console
- API responses include `devEmailOtpPreview` and `devPhoneOtpPreview` fields
- Use these values for testing in development

### Authentication Headers
After receiving a token, include it in subsequent requests:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### User Profile
After registration/login, users have:
- `emailVerified: true`
- `phoneVerified: true`
- `passwordHash: ` (random, users cannot login with password)
- Can only login via OTP

---

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 400 | Invalid input or invalid/expired OTP | Check input format, request new OTP |
| 403 | Email reserved / Account blocked/suspended | Use different email or contact admin |
| 404 | User not found | Check email/phone, register first |
| 409 | Email/phone already registered | Use different email/phone |
| 429 | Too many requests | Wait before retrying |

---

## Security Considerations

1. **OTP Hashing:** OTPs are hashed with bcrypt before storage
2. **Both Channels Required:** Both email AND phone verification required
3. **No Password:** OTP-registered users cannot use password login
4. **Admin Emails:** Certain emails are reserved for admin use
5. **Access Checks:** Blocked/suspended/deleted accounts cannot login
6. **Audit Trail:** All registration and login events are logged

---

## Testing with Development OTPs

In development mode, the backend logs OTPs to console and returns them in the API response:

```bash
# Console output:
[DEV OTP] verify-email for user@example.com: 123456
[DEV PHONE OTP] verify-phone for +1234567890: 654321

# API response includes:
"devEmailOtpPreview": "123456"
"devPhoneOtpPreview": "654321"
```

Use these values directly in the verify endpoint.

---

## Migration from Password Auth

If your application currently uses password-based authentication:

1. Keep using `/auth/login` endpoint (backward compatible)
2. Gradually migrate users to OTP-based authentication
3. Update registration to use `/auth/register/request-otp` → `/auth/register/verify`
4. Users can coexist: some with password, some with OTP-only
