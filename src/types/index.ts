import { UserRole, ServiceCategory, BookingStatus, PaymentStatus, InvoiceStatus, NotificationType } from '@prisma/client';

// User Types
export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  avatar: string | null;
  createdAt: Date;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
}

// Address Types
export interface CreateAddressInput {
  label: string;
  street: string;
  city: string;
  zipCode: string;
  country?: string;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
}

// Service Types
export interface CreateServiceInput {
  name: string;
  slug: string;
  description: string;
  shortDesc?: string;
  price: number;
  priceType?: 'FIXED' | 'HOURLY' | 'PER_SQUARE_METER';
  duration: number;
  category: ServiceCategory;
  image?: string;
  features?: string[];
}

// Booking Types
export interface CreateBookingInput {
  serviceId: string;
  addressId: string;
  scheduledDate: Date;
  scheduledTime: string;
  notes?: string;
  extras?: string[];
}

export interface BookingResponse {
  id: string;
  userId: string;
  serviceId: string;
  serviceName: string;
  workerId: string | null;
  workerName: string | null;
  scheduledDate: Date;
  scheduledTime: string;
  status: BookingStatus;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  notes: string | null;
  createdAt: Date;
}

// Invoice Types
export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  status: InvoiceStatus;
  subtotal: number;
  taxAmount: number;
  total: number;
  dueDate: Date;
  paidAt: Date | null;
  pdfUrl: string | null;
}

// Message Types
export interface CreateMessageInput {
  bookingId?: string;
  /** When set without bookingId, message is stored on a compat-style conversation thread. */
  conversationId?: string;
  content: string;
  attachments?: string[];
}

export interface MessageResponse {
  id: string;
  senderId: string;
  senderName: string;
  senderType: string;
  content: string;
  attachments: string[];
  isRead: boolean;
  createdAt: Date;
}

// Notification Types
export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: Date;
}

// Auth Types
export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

// Payment Types
export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

// Admin Types
export interface DashboardStats {
  totalBookings: number;
  bookingsToday: number;
  totalRevenue: number;
  activeWorkers: number;
  pendingInvoices: number;
}

export interface AnalyticsData {
  bookingsByMonth: { month: string; count: number }[];
  revenueByMonth: { month: string; amount: number }[];
  servicesPopularity: { serviceName: string; bookings: number }[];
}
