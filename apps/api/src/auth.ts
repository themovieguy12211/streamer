import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyRequest } from 'fastify';
import { supabase, toCamel } from '@streaming/database';
import { nanoid } from 'nanoid';

export const sessionCookie = 'streaming_session';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const { error } = await supabase.from('sessions').insert({ id: nanoid(), user_id: userId, token_hash: hashToken(token), expires_at: expiresAt.toISOString() });
  if (error) throw error;
  return { token, expiresAt };
}

export async function getCurrentUser(request: FastifyRequest) {
  const token = request.cookies[sessionCookie];
  if (!token) return null;
  const hash = hashToken(token);
  const { data: sessionData, error: sessionErr } = await supabase.from('sessions').select('*').eq('token_hash', hash).gt('expires_at', new Date().toISOString()).limit(1);
  if (sessionErr) throw sessionErr;
  const session = sessionData?.map(r => toCamel<any>(r))[0];
  if (!session) return null;
  const { data: userData, error: userErr } = await supabase.from('users').select('id, email, username, display_name, role, account_status').eq('id', session.userId).limit(1);
  if (userErr) throw userErr;
  const user = userData?.map(r => toCamel<any>(r))[0];
  if (!user || user.accountStatus !== 'ACTIVE') return null;
  const { data: subData, error: subErr } = await supabase.from('subscriptions').select('status').eq('user_id', user.id).eq('status', 'ACTIVE').limit(1);
  if (subErr) throw subErr;
  return { ...user, isPremium: Boolean(subData?.length) };
}

export async function deleteSession(token?: string) {
  if (token) {
    const { error } = await supabase.from('sessions').delete().eq('token_hash', hashToken(token));
    if (error) throw error;
  }
}
