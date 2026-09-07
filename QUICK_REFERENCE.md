# OTP-Based Authentication - Quick Reference

## 🚀 What Changed

| Before | After |
|--------|-------|
| `/auth/register` + password | `/auth/register/request-otp` → `/auth/register/verify` |
| `/auth/login` + password | `/auth/login/request-otp` → `/auth/login/verify` |

## 🔑 New API Endpoints

### Registration
```
POST /auth/register/request-otp
→ Send OTPs to email & phone

POST /auth/register/verify
→ Create account after verifying both OTPs
```

### Login
```
POST /auth/login/request-otp
→ Send OTPs to email & phone

POST /auth/login/verify
→ Login after verifying both OTPs
```

## 📋 Request/Response Examples

### 1️⃣ Register - Request OTPs
```bash
curl -X POST http://localhost:8787/auth/register/request-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "phoneNumber": "+1234567890",
    "name": "John Doe"
  }'
```

**Response:**
```json
{
  "emailOtpSent": true,
  "phoneOtpSent": true,
  "devEmailOtpPreview": "123456",
  "devPhoneOtpPreview": "654321"
}
```

### 2️⃣ Register - Verify & Create
```bash
curl -X POST http://localhost:8787/auth/register/verify \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "phoneNumber": "+1234567890",
    "emailOtp": "123456",
    "phoneOtp": "654321",
    "name": "John Doe"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user123",
    "username": "johndoe",
    "email": "user@example.com",
    "phoneNumber": "+1234567890",
    "emailVerified": true,
    "phoneVerified": true
  }
}
```

### 3️⃣ Login - Request OTPs
```bash
curl -X POST http://localhost:8787/auth/login/request-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "phoneNumber": "+1234567890"
  }'
```

**Response:**
```json
{
  "emailOtpSent": true,
  "phoneOtpSent": true,
  "devEmailOtpPreview": "654321",
  "devPhoneOtpPreview": "123456"
}
```

### 4️⃣ Login - Verify & Get Token
```bash
curl -X POST http://localhost:8787/auth/login/verify \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "phoneNumber": "+1234567890",
    "emailOtp": "654321",
    "phoneOtp": "123456"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { /* user object */ }
}
```

## ⚙️ How It Works

### Registration Flow
```
1. User enters email, phone, name
2. Frontend calls /auth/register/request-otp
3. OTPs sent to both email & SMS
4. User receives OTPs in inbox/SMS + console (dev)
5. Frontend calls /auth/register/verify with both OTPs
6. Backend creates user with emailVerified=true, phoneVerified=true
7. Return JWT token
8. User is logged in and can use app
```

### Login Flow
```
1. User enters email & phone
2. Frontend calls /auth/login/request-otp
3. OTPs sent to both email & SMS
4. User receives OTPs in inbox/SMS + console (dev)
5. Frontend calls /auth/login/verify with both OTPs
6. Backend verifies user & OTPs
7. Return JWT token
8. User is logged in and can use app
```

## 🔐 What's Verified

✅ Both email OTP verified
✅ Both phone OTP verified
✅ User not blocked
✅ User not suspended
✅ User not deleted
✅ Email/phone not already registered (registration only)
✅ Admin email rejected

## ⏱️ Timing

- **OTP Expiration:** 10 minutes
- **Rate Limit:** 40 attempts per 15 minutes per IP
- **Password Not Required:** OTP-registered users login via OTP only

## 🛠️ Development Mode

### Dev OTP Preview in API Response
```json
{
  "emailOtpSent": false,
  "phoneOtpSent": false,
  "devEmailOtpPreview": "123456",
  "devPhoneOtpPreview": "654321"
}
```

### Console Logs (Backend)
```
[DEV OTP] verify-email for user@example.com: 123456
[DEV PHONE OTP] verify-phone for +1234567890: 654321
```

Use these OTPs directly in the verify endpoint for testing!

## 📱 Using in Frontend

### React Example
```javascript
const [email, setEmail] = useState('');
const [phone, setPhone] = useState('');
const [emailOtp, setEmailOtp] = useState('');
const [phoneOtp, setPhoneOtp] = useState('');
const [stage, setStage] = useState('enter-details'); // enter-details → enter-otp → done

// Step 1: Request OTPs
async function requestOtp() {
  const response = await fetch('/auth/register/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phoneNumber: phone, name: 'John' })
  });
  const data = await response.json();
  if (response.ok) {
    setStage('enter-otp');
  } else {
    alert(data.error);
  }
}

// Step 2: Verify OTPs
async function verifyOtp() {
  const response = await fetch('/auth/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      phoneNumber: phone,
      emailOtp,
      phoneOtp,
      name: 'John'
    })
  });
  const data = await response.json();
  if (response.ok) {
    localStorage.setItem('authToken', data.token);
    setStage('done');
  } else {
    alert(data.error);
  }
}
```

## ✔️ Error Codes

| Code | Error | What to Do |
|------|-------|-----------|
| 400 | Invalid input | Check format (6-digit OTP, valid email/phone) |
| 400 | Invalid OTP | Re-enter OTP carefully |
| 400 | Expired OTP | Request new OTP |
| 403 | Email reserved | Use different email |
| 404 | User not found | Register first |
| 409 | Already registered | Use different email/phone |
| 429 | Too many attempts | Wait 15 minutes |

## 🔄 Backward Compatibility

**Old endpoints still work!**
```
POST /auth/register     (password-based)
POST /auth/login        (password-based)
```

You can use whichever suits your needs.

## 🚨 Important Notes

1. **Both OTPs Required:** Email AND phone OTP must be valid
2. **No Password Login:** OTP-registered users cannot login with password
3. **Rate Limited:** 40 attempts per 15 minutes per IP
4. **10-Minute Expiry:** OTPs expire and must be requested again
5. **Dev OTPs in Console:** Check backend console for dev OTPs
6. **Admin Emails:** Some emails are reserved for admin panel
7. **Phone Normalization:** Phones should be in format +1234567890

## 📚 Full Documentation

- `IMPLEMENTATION_COMPLETE.md` - Detailed changes
- `OTP_AUTH_API_GUIDE.md` - Complete API reference
- `IMPLEMENTATION_NOTES.md` - Technical notes
- `TASK_COMPLETION_CHECKLIST.md` - What was completed

## 🧪 Testing Checklist

- [ ] Can request registration OTPs
- [ ] Can verify registration with valid OTPs
- [ ] Cannot register duplicate email
- [ ] Cannot register duplicate phone
- [ ] Can request login OTPs
- [ ] Can verify login with valid OTPs
- [ ] Expired OTPs rejected
- [ ] Invalid OTPs rejected
- [ ] Rate limiting works
- [ ] Dev OTPs appear in console
- [ ] JWT token works for authenticated requests
- [ ] Old password login still works

## 🎯 Next Steps

1. Update frontend to use new endpoints
2. Test registration with dev OTPs
3. Test login with dev OTPs
4. Configure Twilio for SMS (if not already done)
5. Configure SMTP for email (if not already done)
6. Deploy to production
7. Monitor delivery success rates

---

**Need Help?** Check console logs for `[DEV OTP]` and `[DEV PHONE OTP]` messages.
