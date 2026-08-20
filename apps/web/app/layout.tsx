import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Northstar', description: 'Stories worth your time.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
