import Link from 'next/link';
import type { Metadata } from 'next';
import { GoogleAuthPanel } from '../components/google-auth';

export const metadata: Metadata = {
  title: 'Login | Image Ops',
  description: 'Sign in with Google to use protected Image Ops APIs.',
};

export default function LoginPage() {
  return (
    <main className="app-page">
      <section className="page-shell">
        <header className="page-head">
          <span className="section-label reveal-el" data-delay="0">
            Authentication
          </span>
          <h1 className="reveal-el" data-delay="100">
            Log in to your <span className="accent-italic">workspace.</span>
          </h1>
          <p className="reveal-el" data-delay="180">
            Use your Google account to create a secure Image Ops API session.
          </p>
        </header>

        <GoogleAuthPanel />

        <p style={{ marginTop: '1rem' }}>
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </main>
  );
}
