'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Login() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '' });
  const update = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const response = await fetch(`/api/v1/auth/${register ? 'register' : 'login'}`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(register ? form : { email: form.email, password: form.password }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setMessage(body.message ?? 'Authentication failed.'); return; }
    router.push('/');
    router.refresh();
  };

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <Link className="brand" href="/">Northstar</Link>
      </header>
      <section className="authPanel">
        <span className="eyebrow">{register ? 'Create account' : 'Welcome back'}</span>
        <h1>{register ? 'Join Northstar' : 'Sign in'}</h1>
        <form onSubmit={submit} className="authForm">
          {register && (
            <>
              <label>Display name<input required value={form.displayName} onChange={(e) => update('displayName', e.target.value)} placeholder="Your name" /></label>
              <label>Username<input required minLength={3} value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="username" /></label>
            </>
          )}
          <label>Email<input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input required type="password" minLength={12} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder={register ? 'At least 12 characters' : 'Your password'} /></label>
          {message && <span className="formError">{message}</span>}
          <button className="button" disabled={pending}>{pending ? 'Please wait...' : register ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="textButton" onClick={() => { setRegister(!register); setMessage(''); }}>
          {register ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </section>
    </main>
  );
}
