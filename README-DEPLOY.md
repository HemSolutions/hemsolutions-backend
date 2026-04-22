# HemSolutions Backend Deployment Configuration

This directory contains all configuration files for deploying the HemSolutions backend API.

## Quick Start

### 1. Deploy to Railway (Recommended)

**Option A: GitHub Integration (Easiest)**
1. Push this code to a GitHub repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Add PostgreSQL and Redis services
4. Set environment variables
5. Deploy!

**Option B: Railway CLI**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

**Option C: Deploy Script**
```bash
cd /root/.openclaw/workspace
./deploy.sh
```

### 2. Required Environment Variables

See `railway.env.example` for the complete list. Key variables:

```bash
# Database (auto-set by Railway if using managed Postgres)
DATABASE_URL=postgresql://...

# Redis (auto-set by Railway if using managed Redis)
REDIS_URL=redis://...

# JWT Secrets (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=your_128_char_secret
JWT_REFRESH_SECRET=your_128_char_secret

# Stripe (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# SendGrid (get from https://app.sendgrid.com)
SENDGRID_API_KEY=SG.your_api_key
```

## Configuration Files

| File | Purpose |
|------|---------|
| `railway.json` | Railway deployment configuration |
| `railway.env.example` | Environment variables template |
| `nixpacks.toml` | Alternative build configuration |
| `render.yaml` | Alternative: Render.com deployment |
| `Procfile` | Process configuration |
| `Dockerfile` | Container build instructions |

## Deployment Steps

1. **Configure environment variables** in Railway dashboard
2. **Deploy the application**
3. **Run database migrations**: `railway run npm run db:deploy`
4. **Test the API**: `https://your-app.up.railway.app/health`
5. **Set up Stripe webhook** (see PAYMENT_SETUP_GUIDE.md)

## Post-Deployment

### Health Check
```bash
curl https://your-app.up.railway.app/health
```

### Database Migration
```bash
railway run npm run db:deploy
```

### View Logs
```bash
railway logs
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check `railway.json` and `Dockerfile` |
| DB connection fails | Verify `DATABASE_URL` is set correctly |
| Redis connection fails | Verify `REDIS_URL` is set correctly |
| CORS errors | Update `FRONTEND_URL` to match actual frontend |
| Webhook fails | Check `STRIPE_WEBHOOK_SECRET` is correct |

## Documentation

- **Full Deployment Guide**: See `DEPLOY_TO_RAILWAY.md`
- **Payment Setup**: See `PAYMENT_SETUP_GUIDE.md`
- **Railway Docs**: https://docs.railway.app

## Support

For issues or questions:
1. Check the deployment guide
2. Review Railway documentation
3. Check application logs in Railway dashboard
