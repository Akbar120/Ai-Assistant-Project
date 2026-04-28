'use client';

import { useState } from 'react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      if (response.ok) {
        window.location.href = '/'
      } else {
        const data = await response.json()
        setError(data.error || 'Invalid credentials')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-xs">
        <div className="bg-[#0f172a] bg-opacity-80 backdrop-blur-md border border-[#00f3ff]/20 rounded-2xl shadow-2xl p-6">
          <div className="text-center mb-5">
            <div className="mx-auto w-20 h-20 mb-4">
              <img
                src="/jenny-image/avatar.jpg"
                alt="Jenny"
                className="w-full h-full rounded-full object-cover border-2 border-[#00f3ff]/40 shadow-[0_0_15px_rgba(0,243,255,0.3)]"
              />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Jenny AI Assistant</h1>
            <p className="text-[#00f3ff]/70 text-sm">Analytical • Precise • Action-Biased</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-white/80 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                className="w-full px-4 py-3 bg-[#1e293b]/50 border border-[#334155]/50 rounded-xl text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#00f3ff]/50 focus:border-[#00f3ff] transition-all duration-200"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 bg-[#1e293b]/50 border border-[#334155]/50 rounded-xl text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#00f3ff]/50 focus:border-[#00f3ff] transition-all duration-200 pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors text-[10px] uppercase font-bold"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[#ef4444]/20 border border-[#ef4444]/40 rounded-lg px-4 py-2 text-[#ef4444] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#00f3ff] to-[#00e5ff] hover:from-[#00e5ff] hover:to-[#00d4ff] text-[#0f172a] font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-xs text-[#64748b]/70">
              Local desktop application • Secure access
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}