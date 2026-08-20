import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyRequest } from 'fastify';
import { and, eq, gt } from 'drizzle-orm';
import { db, sessions, subscriptions, users } from '@streaming/database';
import { nanoid } from 'nanoid';

export const sessionCookie = 'streaming_session';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
export async function createSession(userId: string) { const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); await db.insert(sessions).values({ id: nanoid(), userId, tokenHash: hashToken(token), expiresAt }); return { token, expiresAt }; }
export async function getCurrentUser(request: FastifyRequest) { const token = request.cookies[sessionCookie]; if (!token) return null; const [session] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1); if (!session) return null; const [user] = await db.select({ id: users.id, email: users.email, username: users.username, displayName: users.displayName, role: users.role, accountStatus: users.accountStatus }).from(users).where(eq(users.id, session.userId)).limit(1); if (!user || user.accountStatus !== 'ACTIVE') return null; const [subscription] = await db.select({ status: subscriptions.status }).from(subscriptions).where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'ACTIVE'))).limit(1); return { ...user, isPremium: Boolean(subscription) }; }
export async function deleteSession(token?: string) { if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))); }
