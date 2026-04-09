import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { User, AuthSession } from '@/types'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'homelab-manager-secret-key-change-in-production'
)

const TOKEN_EXPIRY = '7d'
const COOKIE_NAME = 'homelab-auth-token'

// In-memory user store for demo (in production, use file-based or database)
const DEMO_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@homelab.local',
    role: 'admin',
    createdAt: new Date().toISOString(),
  },
]

// Demo password hash for "admin" (in production, use bcrypt)
const DEMO_PASSWORDS: Record<string, string> = {
  admin: 'admin', // For demo only - use bcrypt in production
}

export interface JWTPayload {
  userId: string
  username: string
  role: string
  exp: number
}

/**
 * Creates a JWT token for a user
 */
export async function createToken(user: User): Promise<string> {
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET)
  
  return token
}

/**
 * Verifies a JWT token and returns the payload
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

/**
 * Authenticates a user with username and password
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<AuthSession | null> {
  // Find user
  const user = DEMO_USERS.find(u => u.username === username)
  if (!user) {
    return null
  }
  
  // Verify password (in demo, simple comparison; in production, use bcrypt)
  const storedPassword = DEMO_PASSWORDS[username]
  if (!storedPassword || password !== storedPassword) {
    return null
  }
  
  // Create token
  const token = await createToken(user)
  
  // Calculate expiry
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  
  return {
    user: {
      ...user,
      lastLogin: new Date().toISOString(),
    },
    token,
    expiresAt: expiresAt.toISOString(),
  }
}

/**
 * Sets the auth cookie
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

/**
 * Removes the auth cookie
 */
export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

/**
 * Gets the auth cookie value
 */
export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value
}

/**
 * Gets the current authenticated user from the session
 */
export async function getCurrentUser(): Promise<User | null> {
  const token = await getAuthCookie()
  if (!token) {
    return null
  }
  
  const payload = await verifyToken(token)
  if (!payload) {
    return null
  }
  
  const user = DEMO_USERS.find(u => u.id === payload.userId)
  return user || null
}

/**
 * Checks if the current user has a specific role
 */
export async function hasRole(requiredRole: User['role']): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) {
    return false
  }
  
  const roleHierarchy: Record<User['role'], number> = {
    viewer: 1,
    operator: 2,
    admin: 3,
  }
  
  return roleHierarchy[user.role] >= roleHierarchy[requiredRole]
}

/**
 * Middleware helper to require authentication
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

/**
 * Middleware helper to require a specific role
 */
export async function requireRole(role: User['role']): Promise<User> {
  const user = await requireAuth()
  
  const roleHierarchy: Record<User['role'], number> = {
    viewer: 1,
    operator: 2,
    admin: 3,
  }
  
  if (roleHierarchy[user.role] < roleHierarchy[role]) {
    throw new Error('Forbidden')
  }
  
  return user
}
