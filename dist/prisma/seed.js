"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const password_js_1 = require("../utils/password.js");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting database seed...');
    // Create admin user
    const adminPassword = await (0, password_js_1.hashPassword)('admin123456');
    const admin = await prisma.user.upsert({
        where: { email: 'admin@hemsolutions.se' },
        update: {},
        create: {
            email: 'admin@hemsolutions.se',
            password: adminPassword,
            firstName: 'Admin',
            lastName: 'User',
            phone: '+46 70 123 4567',
            role: 'SUPER_ADMIN',
            isVerified: true
        }
    });
    console.log('✅ Admin user created:', admin.email);
    // Create test customer
    const customerPassword = await (0, password_js_1.hashPassword)('customer123456');
    const customer = await prisma.user.upsert({
        where: { email: 'customer@example.com' },
        update: {},
        create: {
            email: 'customer@example.com',
            password: customerPassword,
            firstName: 'Test',
            lastName: 'Customer',
            phone: '+46 70 987 6543',
            role: 'CUSTOMER',
            isVerified: true,
            addresses: {
                create: {
                    label: 'Home',
                    street: 'Stureplan 4',
                    city: 'Stockholm',
                    zipCode: '114 35',
                    country: 'Sweden',
                    isDefault: true
                }
            }
        }
    });
    console.log('✅ Test customer created:', customer.email);
    // Create cleaning services
    const services = [
        {
            name: 'Standard Cleaning',
            slug: 'standard-cleaning',
            description: 'Our standard cleaning service covers all the essential areas of your home. Perfect for regular maintenance cleaning to keep your space fresh and tidy. Includes dusting, vacuuming, mopping, and bathroom cleaning.',
            shortDesc: 'Essential cleaning for regular maintenance',
            price: 450,
            priceType: 'FIXED',
            duration: 120,
            category: 'RESIDENTIAL',
            isPopular: true,
            sortOrder: 1,
            features: ['Dusting all surfaces', 'Vacuuming carpets', 'Mopping floors', 'Bathroom cleaning', 'Kitchen counter cleaning']
        },
        {
            name: 'Deep Cleaning',
            slug: 'deep-cleaning',
            description: 'A thorough, comprehensive cleaning that reaches every corner of your home. Ideal for spring cleaning, before/after events, or when your home needs extra attention. Includes everything in standard cleaning plus detailed attention to often-overlooked areas.',
            shortDesc: 'Thorough cleaning for a fresh start',
            price: 950,
            priceType: 'FIXED',
            duration: 240,
            category: 'RESIDENTIAL',
            isPopular: true,
            sortOrder: 2,
            features: ['Everything in Standard', 'Inside cabinets', 'Behind appliances', 'Window sills', 'Baseboards and doors']
        },
        {
            name: 'Move In/Out Cleaning',
            slug: 'move-in-out-cleaning',
            description: 'Comprehensive cleaning service designed for moving. Ensures your new home is spotless before you move in, or helps you leave your old home in perfect condition for the next occupants.',
            shortDesc: 'Complete cleaning for moving',
            price: 1800,
            priceType: 'FIXED',
            duration: 360,
            category: 'MOVE_IN_OUT',
            sortOrder: 3,
            features: ['Full home cleaning', 'Inside all cabinets', 'Appliance cleaning', 'Closet cleaning', 'Garage cleaning (optional)']
        },
        {
            name: 'Office Cleaning',
            slug: 'office-cleaning',
            description: 'Professional cleaning services for commercial spaces. We work around your schedule to minimize disruption to your business operations.',
            shortDesc: 'Commercial cleaning solutions',
            price: 35,
            priceType: 'HOURLY',
            duration: 180,
            category: 'COMMERCIAL',
            sortOrder: 4,
            features: ['Workstation cleaning', 'Conference room cleaning', 'Kitchen/break room', 'Reception area', 'Flexible scheduling']
        },
        {
            name: 'Post-Construction Cleaning',
            slug: 'post-construction-cleaning',
            description: 'Specialized cleaning after construction or renovation projects. Removes dust, debris, and construction residue to make your space move-in ready.',
            shortDesc: 'Construction cleanup specialists',
            price: 2500,
            priceType: 'FIXED',
            duration: 480,
            category: 'POST_CONSTRUCTION',
            sortOrder: 5,
            features: ['Dust removal', 'Debris cleanup', 'Window cleaning', 'Floor cleaning', 'Surface polishing']
        },
        {
            name: 'Window Cleaning',
            slug: 'window-cleaning',
            description: 'Professional window cleaning service for a crystal clear view. Interior and exterior window cleaning available.',
            shortDesc: 'Crystal clear window cleaning',
            price: 50,
            priceType: 'PER_SQUARE_METER',
            duration: 120,
            category: 'SPECIALIZED',
            sortOrder: 6,
            features: ['Interior windows', 'Exterior windows', 'Frame cleaning', 'Sill cleaning', 'Screen cleaning']
        }
    ];
    for (const service of services) {
        await prisma.service.upsert({
            where: { slug: service.slug },
            update: {},
            create: service
        });
    }
    console.log(`✅ ${services.length} services created`);
    // Create sample workers
    const workers = [
        {
            firstName: 'Anna',
            lastName: 'Andersson',
            email: 'anna.andersson@hemsolutions.se',
            phone: '+46 70 111 1111',
            bio: 'Experienced cleaner with 5+ years in residential cleaning',
            skills: ['Residential', 'Deep Cleaning', 'Organization']
        },
        {
            firstName: 'Erik',
            lastName: 'Eriksson',
            email: 'erik.eriksson@hemsolutions.se',
            phone: '+46 70 222 2222',
            bio: 'Specialized in commercial and post-construction cleaning',
            skills: ['Commercial', 'Post-Construction', 'Window Cleaning']
        },
        {
            firstName: 'Maria',
            lastName: 'Svensson',
            email: 'maria.svensson@hemsolutions.se',
            phone: '+46 70 333 3333',
            bio: 'Detail-oriented cleaner with excellent customer reviews',
            skills: ['Residential', 'Move In/Out', 'Deep Cleaning']
        }
    ];
    for (const worker of workers) {
        await prisma.worker.upsert({
            where: { email: worker.email },
            update: {},
            create: worker
        });
    }
    console.log(`✅ ${workers.length} workers created`);
    // Create admin settings
    const settings = [
        {
            key: 'booking_lead_time_hours',
            value: 24,
            description: 'Minimum hours required before booking'
        },
        {
            key: 'cancellation_policy_hours',
            value: 24,
            description: 'Hours before booking when cancellation is free'
        },
        {
            key: 'tax_rate',
            value: 0.25,
            description: 'VAT/tax rate for invoices'
        },
        {
            key: 'currency',
            value: 'SEK',
            description: 'Default currency'
        }
    ];
    for (const setting of settings) {
        await prisma.adminSettings.upsert({
            where: { key: setting.key },
            update: {},
            create: setting
        });
    }
    console.log(`✅ ${settings.length} admin settings created`);
    console.log('\n✨ Database seed completed!');
    console.log('\nTest accounts:');
    console.log('  Admin: admin@hemsolutions.se / admin123456');
    console.log('  Customer: customer@example.com / customer123456');
}
main()
    .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map