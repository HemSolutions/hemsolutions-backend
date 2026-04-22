# HemSolutions Backend - Railway Deployment Guide

This guide walks you through deploying the HemSolutions backend API to Railway's cloud platform.

---

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Account**: To connect your repository
3. **Stripe Account**: For payment processing (test mode for initial setup)
4. **SendGrid Account**: For email notifications

---

## Deployment Options

### Option 1: Deploy from GitHub (Recommended)

#### Step 1: Push Code to GitHub

```bash
# Navigate to your backend directory
cd hemsolutions-backend

# Initialize git (if not done)
git init
git add .
git commit -m "Initial backend setup for Railway"

# Create a new GitHub repository and push
git remote add origin https://github.com/YOUR_USERNAME/hemsolutions-backend.git
git push -u origin main
```

#### Step 2: Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `hemsolutions-backend` repository

#### Step 3: Add Required Services

In your Railway project dashboard:

**Add PostgreSQL Database:**
1. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway will auto-provision and connect the database
3. `DATABASE_URL` will be automatically added to your environment variables

**Add Redis (Required for sessions):**
1. Click **"New"** → **"Database"** → **"Add Redis"**
2. `REDIS_URL` will be automatically added to your environment variables

#### Step 4: Configure Environment Variables

Go to your service → **Variables** tab. Add the following:

```
# Server
PORT=3001
NODE_ENV=production

# Database (auto-populated by Railway Postgres)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (auto-populated by Railway Redis)
REDIS_URL=${{Redis.REDIS_URL}}

# JWT Secrets (Generate these NOW!)
JWT_SECRET=generated_secret_128_chars
JWT_REFRESH_SECRET=generated_secret_128_chars
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Stripe (Use test keys for now)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
SENDGRID_API_KEY=SG.your_key
EMAIL_FROM=info@hemsolutions.se
EMAIL_FROM_NAME=HemSolutions

# Frontend URL (update after Netlify deployment)
FRONTEND_URL=https://your-frontend-url.netlify.app

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Generate JWT Secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run this twice to get two different secrets.

#### Step 5: Deploy!

Railway will automatically build and deploy your application. Monitor the deployment logs in the **Deployments** tab.

#### Step 6: Run Database Migrations

Once deployed, open Railway's **Logs** tab or use the CLI:

```bash
# Install Railway CLI if needed
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Run migrations
railway run npm run db:deploy
```

Or manually in Railway:
1. Go to your service
2. Click on **"Shell"** tab
3. Run: `npm run db:deploy`

#### Step 7: Verify Deployment

Your API will be available at: `https://your-project-name.up.railway.app`

Test endpoints:
- Health check: `https://your-project.up.railway.app/health`
- API base: `https://your-project.up.railway.app/api`

---

### Option 2: Deploy via Railway CLI (Alternative)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Navigate to project
cd hemsolutions-backend

# Initialize project
railway init

# Add PostgreSQL
railway add --database postgres

# Add Redis  
railway add --database redis

# Set environment variables
railway variables set PORT=3001 NODE_ENV=production
# ... (set all other variables)

# Deploy
railway up

# Run migrations
railway run npm run db:deploy

# Get public URL
railway domain
```

---

## Post-Deployment Setup

### 1. Configure Stripe Webhook

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Endpoint URL: `https://your-project.up.railway.app/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `invoice.payment_succeeded`
   - `customer.subscription.created`
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 2. Verify Email Sending

1. Go to [SendGrid](https://app.sendgrid.com)
2. Verify your sender domain (`hemsolutions.se`)
3. Create an API key with "Mail Send" permissions
4. Test email delivery

### 3. Update Frontend Environment

Update your Netlify environment with the Railway API URL:
```
VITE_API_URL=https://your-project.up.railway.app/api
```

---

## Production Checklist

Before going live:

- [ ] Switch to Stripe **live** keys (pk_live_*, sk_live_*)
- [ ] Configure production domain in Railway
- [ ] Set up custom domain for API (api.hemsolutions.se)
- [ ] Enable SSL certificate
- [ ] Configure backup strategy for database
- [ ] Set up monitoring (Sentry recommended)
- [ ] Enable Railway's "Auto-Deploy" feature
- [ ] Scale to at least 2 replicas for redundancy
- [ ] Test all endpoints thoroughly
- [ ] Configure rate limiting appropriately

---

## Monitoring & Logs

### Railway Dashboard
- **Metrics**: CPU, memory, request count
- **Logs**: Real-time application logs
- **Deployments**: Build history and rollback options

### Health Checks
The API includes a health endpoint:
```
GET https://your-project.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Troubleshooting

### Build Failures
1. Check **Build Logs** in Railway dashboard
2. Verify `railway.json` and `Dockerfile` are correct
3. Ensure `package.json` has correct build scripts

### Database Connection Issues
1. Verify `DATABASE_URL` is set correctly
2. Check if migrations ran successfully: `railway run npm run db:deploy`
3. Test connection: `railway run npx prisma db pull`

### Redis Connection Issues
1. Verify `REDIS_URL` is set
2. Check if Redis service is running in Railway

### CORS Errors
1. Verify `FRONTEND_URL` matches your actual frontend domain
2. Check CORS settings in `src/server.ts`

---

## Cost Estimation (Railway)

- **Hobby Plan**: $5/month (good for development)
- **Pro Plan**: $20/month (recommended for production)
- **Database**: Included in plan limits
- **Redis**: Included in plan limits

See [Railway Pricing](https://railway.app/pricing) for details.

---

## Next Steps

1. **Set up payment processing** → See `PAYMENT_SETUP_GUIDE.md`
2. **Deploy frontend to Netlify** → Continue below
3. **Configure custom domains**
4. **Set up CI/CD pipeline**

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Prisma Docs**: https://prisma.io/docs
- **Stripe Testing**: https://stripe.com/docs/testing
