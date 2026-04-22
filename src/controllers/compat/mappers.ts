import type { Address, Booking, Invoice, InvoiceItem, Service, User, Worker } from '@prisma/client';

const DEFAULT_WORKER_COLOR = '#3B82F6';

/** yyyy-mm-dd in UTC (matches typical stored booking dates). */
export function utcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function bookingStatusToPhp(status: Booking['status']): string {
  const map: Record<Booking['status'], string> = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  };
  return map[status] ?? String(status).toLowerCase();
}

export function phpStatusToBookingStatus(status: string): Booking['status'] | null {
  const s = status.toUpperCase().replace(/-/g, '_');
  const allowed: Booking['status'][] = [
    'PENDING',
    'CONFIRMED',
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ];
  return (allowed as string[]).includes(s) ? (s as Booking['status']) : null;
}

export function invoiceStatusToPhp(status: Invoice['status']): string {
  return String(status).toLowerCase();
}

export function phpInvoiceStatusToPrisma(status: string): Invoice['status'] | null {
  const u = status.toUpperCase();
  const allowed: Invoice['status'][] = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'];
  return (allowed as string[]).includes(u) ? (u as Invoice['status']) : null;
}

export function userToPhpCustomer(
  u: User,
  addr: Address | null,
  customerNumber: string
): Record<string, unknown> {
  return {
    id: u.id,
    customer_number: customerNumber,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    phone: u.phone ?? '',
    mobile_phone: '',
    address: addr?.street ?? '',
    city: addr?.city ?? '',
    postal_code: addr?.zipCode ?? '',
    invoice_address_line1: addr?.street ?? '',
    invoice_address_line2: '',
    invoice_address_line3: '',
    invoice_postal_code: addr?.zipCode ?? '',
    invoice_city: addr?.city ?? '',
    org_number: '',
    person_number: '',
    payment_terms_days: 30,
    late_payment_interest: 8.0,
    discount_percent: 0,
    e_invoice: false,
    gln_number: '',
    reference: '',
    invoice_info: '',
    notes: '',
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

export function buildBookingStartTime(b: Booking): string {
  const ymd = utcYmd(b.scheduledDate);
  return `${ymd} ${b.scheduledTime}:00`;
}

export function buildBookingEndTime(b: Booking): string {
  const start = new Date(`${utcYmd(b.scheduledDate)}T${b.scheduledTime}:00.000Z`);
  const endMs = start.getTime() + b.duration * 60 * 1000;
  const end = new Date(endMs);
  const y = end.getUTCFullYear();
  const m = String(end.getUTCMonth() + 1).padStart(2, '0');
  const d = String(end.getUTCDate()).padStart(2, '0');
  const hh = String(end.getUTCHours()).padStart(2, '0');
  const mm = String(end.getUTCMinutes()).padStart(2, '0');
  const ss = String(end.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

type BookingWithJoins = Booking & {
  user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
  service: Pick<Service, 'name'>;
  worker: Pick<Worker, 'firstName' | 'lastName'> | null;
};

export function bookingToPhp(b: BookingWithJoins): Record<string, unknown> {
  const customerName = `${b.user.firstName} ${b.user.lastName}`.trim();
  const workerName = b.worker
    ? `${b.worker.firstName} ${b.worker.lastName}`.trim()
    : null;
  return {
    id: b.id,
    customer_id: b.userId,
    worker_id: b.workerId,
    service_id: b.serviceId,
    start_time: buildBookingStartTime(b),
    end_time: buildBookingEndTime(b),
    duration_hours: b.duration / 60,
    status: bookingStatusToPhp(b.status),
    notes: b.notes ?? '',
    is_recurring: 0,
    recurrence_rule: null,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    customer_name: customerName,
    customer_email: b.user.email,
    customer_phone: b.user.phone ?? '',
    worker_name: workerName,
    worker_color: DEFAULT_WORKER_COLOR,
    service_name: b.service.name,
  };
}

type InvoiceListRow = Invoice & {
  user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
};

export function invoiceToPhpListRow(inv: InvoiceListRow): Record<string, unknown> {
  const customerName = `${inv.user.firstName} ${inv.user.lastName}`.trim();
  return {
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    customer_id: inv.userId,
    issue_date: utcYmd(inv.createdAt),
    due_date: utcYmd(inv.dueDate),
    total_amount: inv.total,
    vat_amount: inv.taxAmount,
    status: invoiceStatusToPhp(inv.status),
    is_rot_rut: 0,
    rot_rut_amount: 0,
    notes: '',
    reference: null,
    our_reference: null,
    payment_terms: '30',
    created_at: inv.createdAt,
    updated_at: inv.updatedAt,
    customer_name: customerName,
  };
}

type InvoiceDetailRow = Invoice & {
  user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
  items: InvoiceItem[];
  booking?: (Booking & { address: Address }) | null;
};

export function invoiceToPhpDetail(inv: InvoiceDetailRow): Record<string, unknown> {
  const base = invoiceToPhpListRow(inv) as Record<string, unknown>;
  const addr = inv.booking?.address;
  return {
    ...base,
    customer_email: inv.user.email,
    customer_phone: inv.user.phone ?? '',
    customer_address: addr ? `${addr.street}, ${addr.zipCode} ${addr.city}` : '',
    customer_city: addr?.city ?? '',
    customer_postal_code: addr?.zipCode ?? '',
    customer_org_number: '',
    items: inv.items.map((it) => ({
      id: it.id,
      invoice_id: it.invoiceId,
      article_id: null,
      article_name: it.description,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      vat_rate: Math.round(inv.taxRate * 100),
      total_price: it.total,
    })),
  };
}

export function workerToPhp(w: Worker): Record<string, unknown> {
  return {
    id: w.id,
    name: `${w.firstName} ${w.lastName}`.trim(),
    email: w.email,
    phone: w.phone,
    color: DEFAULT_WORKER_COLOR,
    role: 'employee',
    is_active: w.isActive ? 1 : 0,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  };
}

/** Article row (Service) — matches `hemsolutions` Article / articles.php list. */
export function serviceToPhpArticle(s: Service): Record<string, unknown> {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    price: s.price,
    type: String(s.priceType).toLowerCase(),
    vat_rate: 25,
    is_rot_rut: 0,
    unit: 'st',
    is_active: s.isActive ? 1 : 0,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

export type CompatReminderStoreRow = {
  id: string;
  invoiceId: string;
  status: string;
  reminderLevel?: number;
  feeAmount?: number;
  message?: string;
  createdAt: string;
  updatedAt?: string;
};

type InvoiceMini = {
  invoiceNumber: string;
  userId: string;
  total: number;
  dueDate: Date;
  user: { firstName: string; lastName: string };
};

export function reminderCompatToPhp(r: CompatReminderStoreRow, inv: InvoiceMini | null): Record<string, unknown> {
  return {
    id: r.id,
    invoice_id: r.invoiceId,
    invoice_number: inv?.invoiceNumber ?? '',
    customer_id: inv?.userId ?? '',
    customer_name: inv ? `${inv.user.firstName} ${inv.user.lastName}`.trim() : '',
    reminder_level: r.reminderLevel ?? 1,
    reminder_date: inv ? utcYmd(inv.dueDate) : r.createdAt.slice(0, 10),
    fee_amount: r.feeAmount ?? 0,
    message: r.message ?? '',
    status: r.status,
    created_at: r.createdAt,
    updated_at: r.updatedAt ?? r.createdAt,
    total_amount: inv?.total ?? null,
    due_date: inv ? utcYmd(inv.dueDate) : null,
  };
}

export type CompatPaymentStoreRow = {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  createdAt: string;
};

export function paymentCompatToPhp(
  p: CompatPaymentStoreRow,
  inv: { invoiceNumber: string; user: { firstName: string; lastName: string } } | null
): Record<string, unknown> {
  return {
    id: p.id,
    invoice_id: p.invoiceId,
    invoice_number: inv?.invoiceNumber ?? '',
    customer_id: p.customerId,
    customer_name: inv ? `${inv.user.firstName} ${inv.user.lastName}`.trim() : '',
    amount: p.amount,
    payment_date: p.paymentDate,
    payment_method: p.paymentMethod,
    reference: p.reference ?? '',
    created_at: p.createdAt,
  };
}

export type CompatReceiptStoreItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  article_id?: string | null;
};

export type CompatReceiptStoreRow = {
  id: string;
  invoiceId: string;
  receiptNumber: string;
  customerId: string;
  issueDate: string;
  totalAmount: number;
  vatAmount: number;
  paymentMethod?: string;
  items: CompatReceiptStoreItem[];
  createdAt: string;
};

export function receiptCompatToPhp(r: CompatReceiptStoreRow, customerName: string): Record<string, unknown> {
  return {
    id: r.id,
    receipt_number: r.receiptNumber,
    invoice_id: r.invoiceId,
    customer_id: r.customerId,
    customer_name: customerName,
    issue_date: r.issueDate,
    total_amount: r.totalAmount,
    vat_amount: r.vatAmount,
    payment_method: r.paymentMethod ?? '',
    created_at: r.createdAt,
    items: r.items.map((it, i) => ({
      id: `${r.id}-line-${i}`,
      receipt_id: r.id,
      article_id: it.article_id ?? null,
      article_name: it.description,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      total_price: it.total,
      vat_rate: 25,
    })),
  };
}
