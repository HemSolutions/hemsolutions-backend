# HemSolutions Payment Setup Guide

Complete guide for setting up Stripe, Swish, and BankID payment integrations for HemSolutions.

---

## Table of Contents
1. [Stripe Payment Setup](#stripe-payment-setup)
2. [Swish Payment Setup](#swish-payment-setup)
3. [BankID Authentication Setup](#bankid-authentication-setup)
4. [Testing Guide](#testing-guide)
5. [Production Checklist](#production-checklist)

---

## Stripe Payment Setup

### Step 1: Create Stripe Account

1. Go to [stripe.com](https://stripe.com)
2. Sign up for an account
3. Complete business verification (for live mode)
4. Access your dashboard at [dashboard.stripe.com](https://dashboard.stripe.com)

### Step 2: Get API Keys

**Test Mode (Development):**
1. In Dashboard, ensure "Test mode" toggle is ON
2. Go to **Developers** → **API keys**
3. Copy:
   - **Publishable key**: `pk_test_...`
   - **Secret key**: `sk_test_...`

**Live Mode (Production):**
1. Activate your account (complete verification)
2. Toggle "Test mode" OFF
3. Copy live keys:
   - **Publishable key**: `pk_live_...`
   - **Secret key**: `sk_live_...`

### Step 3: Configure Stripe in Railway

Add these environment variables to your Railway project:

```
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Step 4: Set Up Stripe Webhook

Webhooks notify your backend of payment events.

1. Go to **Developers** → **Webhooks** in Stripe Dashboard
2. Click **"Add endpoint"**
3. **Endpoint URL**: `https://your-railway-app.up.railway.app/webhooks/stripe`
4. Select these events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.created`
   - `checkout.session.completed`
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add to Railway: `STRIPE_WEBHOOK_SECRET=whsec_...`

### Step 5: Test Card Payments

Use these test card numbers:

| Scenario | Card Number |
|----------|-------------|
| Successful payment | `4242 4242 4242 4242` |
| Payment declined | `4000 0000 0000 0002` |
| Requires 3D Secure | `4000 0025 0000 3155` |

For all test cards:
- **Expiry**: Any future date (e.g., 12/25)
- **CVC**: Any 3 digits (e.g., 123)
- **ZIP**: Any 5 digits

---

## Swish Payment Setup

Swish is Sweden's popular mobile payment system. Integration requires a Swish merchant agreement.

### Step 1: Get Swish Merchant Account

1. **Contact your bank** (Swedbank, Nordea, SEB, etc.)
2. Request a **Swish Handel** (Swish Commerce) account
3. Provide:
   - Swedish business registration number (org.nr)
   - Bank account for settlements
   - Technical contact information
4. Sign the Swish agreement

### Step 2: Get API Credentials

After approval, your bank provides:
- **Merchant ID** (e.g., `1231181189`)
- **Certificate files** (.p12 or .pem)
- **API endpoint URL**

### Step 3: Configure Swish in Backend

Add to Railway environment variables:

```
# Swish Configuration
SWISH_API_URL=https://mss.cpc.getswish.net/swish-cpcapi/api/v1
SWISH_MERCHANT_ID=1231181189
SWISH_CERT_PATH=/app/certs/swish.pem
SWISH_KEY_PATH=/app/certs/swish.key
```

### Step 4: Upload Certificates to Railway

**Option A: Railway Volumes (Recommended)**

1. Create a volume in Railway dashboard
2. Mount at `/app/certs`
3. Upload certificate files to the volume

**Option B: Base64 Encoding**

Encode certificates and add as environment variables:

```bash
# Encode certificate
base64 -w 0 your-swish-cert.pem
base64 -w 0 your-swish-key.pem
```

Add to Railway:
```
SWISH_CERT_BASE64=LS0tLS1CRUdJTi...
SWISH_KEY_BASE64=LS0tLS1CRUdJTi...
```

Modify the backend code to decode at runtime.

### Step 5: Test Swish Payments

Swish provides a test environment:
- **Test API**: `https://mss.cpc.getswish.net/swish-cpcapi/api/v1`
- Use the Swish app in test mode
- Test phone number: `0701740605`

---

## BankID Authentication Setup

BankID is Sweden's electronic identification system, required for high-trust operations.

### Step 1: Get BankID Service Agreement

BankID is provided through authorized resellers:

1. **Contact a BankID vendor**:
   - [GrandID](https://grandid.com) (formerly Mobile BankID)
   - [Svensk e-identitet](https://eidentitet.se)
   - [Verisec](https://verisec.se)
   - Directly through participating banks

2. **Sign agreement** and get:
   - API credentials
   - Certificate files (.p12)
   - Passphrase for certificate
   - Test environment access

### Step 2: BankID Integration Types

**Option A: Same Device** (Mobile)
- User opens app on same device
- Auto-redirects to BankID app
- Returns to your app after authentication

**Option B: Another Device** (Desktop)
- User sees QR code on desktop
- Scans with mobile BankID app
- Authenticates on mobile
- Desktop updates automatically

### Step 3: Configure BankID in Backend

Add to Railway environment variables:

```
# BankID Test Environment
BANKID_API_URL=https://appapi2.test.bankid.com/rp/v5.1
BANKID_PFX_PATH=/app/certs/bankid.p12
BANKID_PFX_PASSPHRASE=your_certificate_passphrase

# For Production
# BANKID_API_URL=https://appapi2.bankid.com/rp/v5.1
```

### Step 4: Upload BankID Certificate

Upload your .p12 file to Railway:

```bash
# Base64 encode the certificate
base64 -w 0 bankid.p12
```

Add to Railway:
```
BANKID_PFX_BASE64=base64_encoded_certificate
BANKID_PFX_PASSPHRASE=your_passphrase
```

### Step 5: Test BankID Authentication

**Test BankID App:**
- Download from: [test.bankid.com](https://www.bankid.com/en/utvecklare/test)
- Install on mobile device
- Use test personal numbers:
  - `198001011234` (successful auth)
  - `198001011235` (cancelled by user)
  - `198001011236` (cancelled by RP)

---

## Testing Guide

### Complete Payment Flow Testing

#### 1. Stripe Card Payment Test

```bash
# Test creating a booking with payment
curl -X POST https://your-api.up.railway.app/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "serviceId": "your-service-id",
    "addressId": "your-address-id",
    "scheduledDate": "2024-12-25T10:00:00Z",
    "scheduledTime": "10:00",
    "paymentMethod": "card",
    "stripePaymentMethodId": "pm_test_..."
  }'
```

#### 2. Webhook Testing Locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/webhooks/stripe

# Copy webhook signing secret and update .env
```

#### 3. API Health Check

```bash
# Test API is running
curl https://your-api.up.railway.app/health

# Expected response:
{"status":"healthy","timestamp":"...","version":"1.0.0"}
```

#### 4. Database Connection Test

```bash
# Via Railway shell
railway run npx prisma db pull
```

---

## Production Checklist

### Before Going Live

#### Stripe
- [ ] Switch from test keys to live keys
- [ ] Update webhook URL to production domain
- [ ] Configure webhook endpoint for live events
- [ ] Test with real card (small amount)
- [ ] Set up Stripe Radar for fraud detection
- [ ] Configure email receipts in Stripe
- [ ] Set up dispute handling process

#### Swish
- [ ] Confirm Swish Handel agreement is active
- [ ] Switch from test to production certificates
- [ ] Verify merchant ID is correct
- [ ] Test with real Swish payment
- [ ] Confirm settlement account receives funds

#### BankID
- [ ] Switch from test to production certificate
- [ ] Update API URL to production
- [ ] Test with real BankID
- [ ] Verify user data is handled securely
- [ ] Implement proper error handling

#### Security
- [ ] Enable HTTPS only (Railway does this automatically)
- [ ] Set up Content Security Policy headers
- [ ] Configure rate limiting appropriately
- [ ] Review JWT secret strength
- [ ] Enable audit logging for payments
- [ ] Set up Sentry or similar error tracking

#### Compliance
- [ ] GDPR compliance for payment data
- [ ] PCI DSS compliance (Stripe handles most)
- [ ] Terms of service updated
- [ ] Privacy policy updated
- [ ] Refund policy defined

---

## Troubleshooting

### Common Stripe Issues

**Webhook signature verification failed**
- Verify `STRIPE_WEBHOOK_SECRET` is correct
- Ensure webhook URL is accessible from internet
- Check if body parser is not modifying the payload

**Payment method not attached to customer**
- Create customer first: `POST /api/payments/customer`
- Then attach payment method
- Or use Stripe Checkout for simplicity

### Common Swish Issues

**Certificate errors**
- Verify certificate is not expired
- Check passphrase is correct
- Ensure certificate matches the merchant ID

**Payment not received**
- Verify callback URL is accessible
- Check that webhook handler processes Swish callbacks
- Review Swish transaction status in bank portal

### Common BankID Issues

**Certificate passphrase errors**
- Double-check the passphrase with your vendor
- Verify certificate file is not corrupted

**User never receives prompt**
- For same-device: Ensure redirect URL is correct
- For another-device: Ensure QR code is displayed properly

---

## API Endpoints Reference

### Stripe Endpoints

```
POST /api/payments/customer          - Create Stripe customer
POST /api/payments/intent            - Create payment intent
POST /api/payments/confirm           - Confirm payment
POST /api/payments/setup-intent      - Setup future payments
GET  /api/payments/methods           - List saved payment methods
DELETE /api/payments/methods/:id     - Remove payment method
```

### Swish Endpoints

```
POST /api/payments/swish             - Create Swish payment
GET  /api/payments/swish/:id/status  - Check payment status
```

### BankID Endpoints

```
POST /api/auth/bankid/init           - Initiate BankID auth
GET  /api/auth/bankid/:id/collect    - Poll auth status
POST /api/auth/bankid/cancel         - Cancel auth request
```

---

## Support Resources

- **Stripe Docs**: https://stripe.com/docs
- **Stripe Support**: support@stripe.com
- **Swish Developer**: https://developer.swish.nu
- **BankID Developer**: https://www.bankid.com/en/utvecklare
- **GrandID Docs**: https://docs.grandid.com

---

## Next Steps

1. **Test all payment methods** in development
2. **Configure production credentials**
3. **Run through complete user journeys**
4. **Set up monitoring and alerting**
5. **Prepare customer support documentation**
6. **Plan soft launch with limited users**

---

*Last updated: 2024*
