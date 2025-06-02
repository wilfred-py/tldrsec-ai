import { PrismaClient } from '../generated/prisma'

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: 
// https://pris.ly/d/help/next-js-best-practices

// Define the global variable properly
declare global {
  var prisma: PrismaClient | undefined
}

// Use a try-catch to handle potential initialization errors
let prisma: PrismaClient

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  })
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      // Remove 'query' from log levels to reduce CLI clutter
      log: ['error', 'warn'],
    })
  }
  prisma = global.prisma
}

export { prisma } 