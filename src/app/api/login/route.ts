import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory user store for desktop app
// In production, you'd want to use a proper database or secure storage
const VALID_CREDENTIALS = {
  username: 'Saber120',
  password: 'Nezuko@120' // Change this on first run or via env var
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    // Basic validation
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Check credentials
    if (
      username === VALID_CREDENTIALS.username &&
      password === VALID_CREDENTIALS.password
    ) {
      // Set session cookie
      const response = NextResponse.json({ success: true })
      
      // Set HTTP-only cookie for session
      response.headers.set(
        'Set-Cookie',
        `session_token=Saber120_session_token_nezuko120; HttpOnly; Path=/; Max-Age=86400` // 24 hours
      )
      
      return response
    } else {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }
  } catch (error) {
    console.error('[Login API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Add GET method to check auth status (optional)
export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session_token')?.value
  
  if (sessionToken === 'Saber120_session_token_nezuko120') {
    return NextResponse.json({ authenticated: true })
  }
  
  return NextResponse.json({ authenticated: false }, { status: 401 })
}