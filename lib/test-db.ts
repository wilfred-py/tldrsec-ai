import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('Starting database connection test...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    const prisma = new PrismaClient({
        log: ['info', 'warn', 'error'],
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        }
    });
    
    try {
        console.log('Testing database connection...');
        const result = await prisma.$queryRaw `SELECT NOW() as current_time`;
        console.log('✅ Successfully connected to the database!');
        console.log('Current server time:', result);
        
        console.log('Testing user count...');
        const userCount = await prisma.user.count();
        console.log(`✅ Users: ${userCount}`);
        
        console.log('Database connection test completed successfully!');
    }
    catch (error) {
        console.error('❌ Failed to connect to the database:');
        console.error('Error details:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
    }
    finally {
        console.log('Disconnecting from database...');
        await prisma.$disconnect();
        console.log('Disconnected.');
    }
}
// Check if this file is being run directly
if (typeof require !== 'undefined' && require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = main;
