import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100 // max requests per window

// In-memory store for rate limiting (appropriate for single-instance desktop app)
// Format: { ip: { count: number, resetTime: number } }
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Exempt API routes that don't require authentication
const EXEMPT_API_ROUTES = [
  '/api/login',
  '/api/logout',
  '/api/test-ollama',
  '/api/status',
  '/api/chat/save',
  '/api/chat/history',
  '/api/chat/clear',
  '/api/chat/latest',
  '/api/chat',
  '/api/tasks'
]

// Session token from environment variable
const VALID_SESSION_TOKEN = process.env.SESSION_TOKEN || 'Saber120_session_token_nezuko120'

function isRateLimited(ip: string): { limited: boolean; resetTime: number } {
  const now = Date.now()
  const record = rateLimitStore.get(ip)
  
  // If no record or expired, create new record
  if (!record || record.resetTime < now) {
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    })
    return { limited: false, resetTime: 0 }
  }
  
  // Increment count
  record.count++
  
  // Check if over limit
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    return { limited: true, resetTime: record.resetTime }
  }
  
  return { limited: false, resetTime: 0 }
}

// Clean up old rate limit records (called when needed, not via setInterval in middleware)
function cleanupRateLimitStore() {
  const now = Date.now()
  for (const [ip, record] of rateLimitStore.entries()) {
    if (record.resetTime < now) {
      rateLimitStore.delete(ip)
    }
  }
}

// Call cleanup periodically (middleware runs on each request, so cleanup on occasional requests)
if (Math.random() < 0.01) { // ~1% chance per request
  cleanupRateLimitStore()
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Get client IP (works in localhost and deployed)
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             '127.0.0.1'
  
  // Check if it's an API route
  if (pathname.startsWith('/api/')) {
    // Allow exempt API routes without authentication and without rate limiting
    if (EXEMPT_API_ROUTES.some(route => pathname.startsWith(route))) {
      return NextResponse.next()
    }
    
    // Apply rate limiting to all other API routes
    const { limited, resetTime } = isRateLimited(ip)
    if (limited) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests, please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString()
          }
        }
      )
    }
    
    // For all other API routes, check for valid session token
    const sessionToken = request.cookies.get('session_token')?.value
    
    if (sessionToken !== VALID_SESSION_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    return NextResponse.next()
  }
  
  // For page routes, protect everything except login page and static assets
  if (pathname !== '/login' && 
      !pathname.startsWith('/_next/') && 
      !pathname.startsWith('/favicon.ico') &&
      !pathname.startsWith('/jenny-image/') &&
      !pathname.startsWith('/api/')) {
    
    const sessionToken = request.cookies.get('session_token')?.value
    
    if (sessionToken !== VALID_SESSION_TOKEN) {
      // Redirect to login page
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/login',
    '/((?!_next|favicon.ico).*)'
  ]
}