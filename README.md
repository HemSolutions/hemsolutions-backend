# HemSolutions Backend API

Production-ready backend API for HemSolutions Cleaning Service website.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Sessions**: Redis
- **Authentication**: JWT + bcrypt
- **Payments**: Stripe
- **Email**: SendGrid
- **Real-time**: Socket.io
- **Testing**: Jest

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Database setup
npx prisma migrate dev
npx prisma generate

# Start development server
npm run dev

# Run tests
npm test
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Users
- `GET /api/users/profile` - Get profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/addresses` - List addresses
- `POST /api/users/addresses` - Add address
- `PUT /api/users/addresses/:id` - Update address
- `DELETE /api/users/addresses/:id` - Delete address

### Services
- `GET /api/services` - List all services
- `GET /api/services/:slug` - Get service by slug

### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings` - List user bookings
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id/cancel` - Cancel booking
- `PUT /api/bookings/:id/assign` - Assign worker (admin)

### Invoices
- `GET /api/invoices` - List invoices
- `GET /api/invoices/:id` - Get invoice
- `POST /api/invoices/:id/pay` - Pay invoice (Stripe)
- `GET /api/invoices/:id/download` - Download PDF

### Messages
- `GET /api/messages/booking/:bookingId` - Get chat history
- `POST /api/messages` - Send message

### Notifications
- `GET /api/notifications` - List notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/analytics` - Analytics data
- `GET /api/admin/bookings` - All bookings
- `GET /api/admin/users` - All users
- `GET /api/admin/workers` - All workers
