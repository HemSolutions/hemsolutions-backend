import { Request, Response } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { hashPassword } from '../../utils/password';
import { compatJson } from './compatHttp';
import { userToPhpCustomer } from './mappers';
import { KEYS, mutateJsonStore, readJsonStore } from '../../services/compat/appCompatJsonStore';
import {
  compatCacheKey,
  compatGetJson,
  compatSetJson,
  invalidateCompatCustomers,
} from '../../services/cache/compatCache';

type CustomerExtras = {
  customer_type?: string;
  tax_reduction_type?: string;
  organization_number?: string;
  person_number?: string;
  invoice_address_1?: string;
  invoice_address_2?: string;
  invoice_postcode?: string;
  invoice_city?: string;
  invoice_reference?: string;
  notes?: string;
};

type CustomerProfilesStore = Record<string, CustomerExtras>;

function pickCustomerExtras(data: Record<string, unknown>): CustomerExtras {
  return {
    customer_type: data.customer_type != null ? String(data.customer_type) : undefined,
    tax_reduction_type: data.tax_reduction_type != null ? String(data.tax_reduction_type) : undefined,
    organization_number: data.organization_number != null ? String(data.organization_number) : undefined,
    person_number: data.person_number != null ? String(data.person_number) : undefined,
    invoice_address_1: data.invoice_address_1 != null ? String(data.invoice_address_1) : undefined,
    invoice_address_2: data.invoice_address_2 != null ? String(data.invoice_address_2) : undefined,
    invoice_postcode: data.invoice_postcode != null ? String(data.invoice_postcode) : undefined,
    invoice_city: data.invoice_city != null ? String(data.invoice_city) : undefined,
    invoice_reference: data.invoice_reference != null ? String(data.invoice_reference) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
  };
}

function mergeCustomerRow(base: Record<string, unknown>, extra: CustomerExtras | undefined): Record<string, unknown> {
  if (!extra) return base;
  return {
    ...base,
    org_number: extra.organization_number ?? base.org_number ?? '',
    person_number: extra.person_number ?? base.person_number ?? '',
    invoice_address_line1: extra.invoice_address_1 ?? base.invoice_address_line1 ?? '',
    invoice_address_line2: extra.invoice_address_2 ?? base.invoice_address_line2 ?? '',
    invoice_postal_code: extra.invoice_postcode ?? base.invoice_postal_code ?? '',
    invoice_city: extra.invoice_city ?? base.invoice_city ?? '',
    reference: extra.invoice_reference ?? base.reference ?? '',
    notes: extra.notes ?? base.notes ?? '',
    customer_type: extra.customer_type ?? 'private',
    tax_reduction_type: extra.tax_reduction_type ?? 'none',
  };
}

function customerNumberForUser(id: string): string {
  return `K-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Mirrors `hemsolutions/app/api/customers.php` — raw JSON, no success wrapper.
 */
export async function handleCustomers(req: Request, res: Response): Promise<void> {
  try {
    const method = req.method;

    if (method === 'GET') {
      const profiles = (await readJsonStore<CustomerProfilesStore>(KEYS.customerProfiles)) ?? {};
      const id = req.query.id as string | undefined;
      if (id) {
        const u = await prisma.user.findFirst({
          where: { id, role: UserRole.CUSTOMER },
          include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
        });
        if (!u) {
          compatJson(res, { error: 'Kund hittades inte' }, 404);
          return;
        }
        const addr = u.addresses[0] ?? null;
        compatJson(res, mergeCustomerRow(userToPhpCustomer(u, addr, customerNumberForUser(u.id)), profiles[u.id]));
        return;
      }

      if (
        req.query.page !== undefined ||
        req.query.limit !== undefined ||
        req.query.search !== undefined ||
        req.query.sort !== undefined
      ) {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20));
        const offset = (page - 1) * limit;
        const search = String(req.query.search ?? '').trim();
        const sortByRaw = String(req.query.sort ?? 'name');
        const sortOrder = String(req.query.order ?? 'ASC').toUpperCase() === 'DESC' ? 'desc' : 'asc';
        const allowed = new Set(['name', 'email', 'phone', 'created_at']);
        const sortBy = allowed.has(sortByRaw) ? sortByRaw : 'name';

        const where: Prisma.UserWhereInput = {
          role: UserRole.CUSTOMER,
          ...(search
            ? {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        };

        const orderBy: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[] =
          sortBy === 'name'
            ? [{ firstName: sortOrder }, { lastName: sortOrder }]
            : sortBy === 'email'
              ? { email: sortOrder }
              : sortBy === 'phone'
                ? { phone: sortOrder }
                : { createdAt: sortOrder };

        const listCacheKey = compatCacheKey('customers', { page, limit, search, sortBy, sortOrder });
        const cachedList = await compatGetJson<{
          customers: Record<string, unknown>[];
          pagination: { page: number; limit: number; total: number; total_pages: number };
        }>(listCacheKey, 'medium');
        if (cachedList) {
          compatJson(res, cachedList);
          return;
        }

        const [users, total] = await Promise.all([
          prisma.user.findMany({
            where,
            include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
            orderBy,
            skip: offset,
            take: limit,
          }),
          prisma.user.count({ where }),
        ]);

        const customers = users.map((u) =>
          mergeCustomerRow(userToPhpCustomer(u, u.addresses[0] ?? null, customerNumberForUser(u.id)), profiles[u.id])
        );

        const payload = {
          customers,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit),
          },
        };
        await compatSetJson(listCacheKey, payload, 'medium');
        compatJson(res, payload);
        return;
      }

      const allKey = compatCacheKey('customers', { branch: 'all' });
      const cachedAll = await compatGetJson<Record<string, unknown>[]>(allKey, 'long');
      if (cachedAll) {
        compatJson(res, cachedAll);
        return;
      }

      const users = await prisma.user.findMany({
        where: { role: UserRole.CUSTOMER },
        include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: 5000,
      });
      const allRows = users.map((u) =>
        mergeCustomerRow(userToPhpCustomer(u, u.addresses[0] ?? null, customerNumberForUser(u.id)), profiles[u.id])
      );
      await compatSetJson(allKey, allRows, 'long');
      compatJson(res, allRows);
      return;
    }

    if (method === 'POST') {
      const data = req.body as Record<string, unknown>;
      const name = String(data.name ?? '').trim();
      if (!name) {
        compatJson(res, { error: 'Namn krävs' }, 400);
        return;
      }
      const emailRaw = String(data.email ?? '').trim();
      if (!emailRaw) {
        compatJson(res, { error: 'E-post krävs' }, 400);
        return;
      }
      const existing = await prisma.user.findUnique({ where: { email: emailRaw } });
      if (existing) {
        compatJson(res, { error: 'E-post används redan' }, 409);
        return;
      }
      const parts = name.split(/\s+/);
      const firstName = parts[0] ?? 'Customer';
      const lastName = parts.slice(1).join(' ') || '—';
      const password = String(data.password ?? `compat-${crypto.randomUUID()}`);
      const hashedPassword = await hashPassword(password);

      const u = await prisma.user.create({
        data: {
          email: emailRaw,
          password: hashedPassword,
          firstName,
          lastName,
          phone: String(data.phone ?? data.mobile_phone ?? '') || null,
          role: UserRole.CUSTOMER,
        },
      });
      const addressLine = String(data.address ?? data.invoice_address_1 ?? '').trim();
      const city = String(data.city ?? data.invoice_city ?? '').trim();
      const postalCode = String(data.postcode ?? data.postal_code ?? data.invoice_postcode ?? '').trim();
      if (addressLine && city && postalCode) {
        await prisma.address.create({
          data: {
            userId: u.id,
            label: 'Home',
            street: addressLine,
            city,
            zipCode: postalCode,
            country: 'Sweden',
            isDefault: true,
          },
        });
      }
      const extras = pickCustomerExtras(data);
      await mutateJsonStore<CustomerProfilesStore>(KEYS.customerProfiles, () => ({}), (cur) => ({
        ...cur,
        [u.id]: extras,
      }));

      const customerNumber =
        String(data.customer_number ?? '').trim() || customerNumberForUser(u.id);

      const created = await prisma.user.findFirst({
        where: { id: u.id },
        include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
      });
      if (!created) {
        compatJson(res, { error: 'Kund hittades inte' }, 500);
        return;
      }
      compatJson(
        res,
        mergeCustomerRow(userToPhpCustomer(created, created.addresses[0] ?? null, customerNumber), extras),
        201
      );
      void invalidateCompatCustomers();
      return;
    }

    if (method === 'PUT') {
      const id = req.query.id as string | undefined;
      if (!id) {
        compatJson(res, { error: 'ID krävs' }, 400);
        return;
      }
      const data = req.body as Record<string, unknown>;
      const u = await prisma.user.findFirst({ where: { id, role: UserRole.CUSTOMER } });
      if (!u) {
        compatJson(res, { error: 'Kund hittades inte' }, 404);
        return;
      }

      const name = data.name != null ? String(data.name).trim() : null;
      let firstName = u.firstName;
      let lastName = u.lastName;
      if (name) {
        const parts = name.split(/\s+/);
        firstName = parts[0] ?? firstName;
        lastName = parts.slice(1).join(' ') || lastName;
      }

      await prisma.user.update({
        where: { id },
        data: {
          ...(data.email != null ? { email: String(data.email) } : {}),
          firstName,
          lastName,
          ...(data.phone != null || data.mobile_phone != null
            ? { phone: String(data.phone ?? data.mobile_phone ?? '') || null }
            : {}),
        },
      });
      const addressLine = data.address != null ? String(data.address).trim() : null;
      const city = data.city != null ? String(data.city).trim() : null;
      const postalCode = data.postcode != null || data.postal_code != null
        ? String(data.postcode ?? data.postal_code ?? '').trim()
        : null;
      if (addressLine || city || postalCode) {
        const existingAddress = await prisma.address.findFirst({
          where: { userId: id },
          orderBy: { isDefault: 'desc' },
        });
        if (existingAddress) {
          await prisma.address.update({
            where: { id: existingAddress.id },
            data: {
              ...(addressLine != null ? { street: addressLine } : {}),
              ...(city != null ? { city } : {}),
              ...(postalCode != null ? { zipCode: postalCode } : {}),
            },
          });
        } else if (addressLine && city && postalCode) {
          await prisma.address.create({
            data: {
              userId: id,
              label: 'Home',
              street: addressLine,
              city,
              zipCode: postalCode,
              country: 'Sweden',
              isDefault: true,
            },
          });
        }
      }
      const extras = pickCustomerExtras(data);
      await mutateJsonStore<CustomerProfilesStore>(KEYS.customerProfiles, () => ({}), (cur) => ({
        ...cur,
        [id]: {
          ...(cur[id] ?? {}),
          ...Object.fromEntries(Object.entries(extras).filter(([, v]) => v !== undefined)),
        },
      }));

      const refreshed = await prisma.user.findFirst({
        where: { id, role: UserRole.CUSTOMER },
        include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
      });
      if (!refreshed) {
        compatJson(res, { error: 'Kund hittades inte' }, 404);
        return;
      }
      const profiles = (await readJsonStore<CustomerProfilesStore>(KEYS.customerProfiles)) ?? {};
      compatJson(
        res,
        mergeCustomerRow(
          userToPhpCustomer(refreshed, refreshed.addresses[0] ?? null, customerNumberForUser(refreshed.id)),
          profiles[refreshed.id]
        )
      );
      void invalidateCompatCustomers();
      return;
    }

    if (method === 'DELETE') {
      const id = req.query.id as string | undefined;
      if (!id) {
        compatJson(res, { error: 'ID krävs' }, 400);
        return;
      }
      const bookingCount = await prisma.booking.count({ where: { userId: id } });
      if (bookingCount > 0) {
        compatJson(res, { error: 'Kan inte ta bort kund med bokningar' }, 400);
        return;
      }
      const u = await prisma.user.findFirst({ where: { id, role: UserRole.CUSTOMER } });
      if (!u) {
        compatJson(res, { error: 'Kund hittades inte' }, 404);
        return;
      }
      await prisma.user.delete({ where: { id } });
      await mutateJsonStore<CustomerProfilesStore>(KEYS.customerProfiles, () => ({}), (cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      compatJson(res, { id, deleted: 1 });
      void invalidateCompatCustomers();
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('compat customers:', e);
    }
    compatJson(res, { error: 'Server error' }, 500);
  }
}
