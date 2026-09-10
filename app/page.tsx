import { withAuth } from '@workos-inc/authkit-nextjs';
import Link from 'next/link';
import { Mark } from '@/components/Mark';

// The public landing page. A signed-out visitor sees the pitch and a sign-in button.
// A signed-in one sees a way through to the app.
export default async function Home() {
  const { user } = await withAuth();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <Mark />
      <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold tracking-tight sm:text-7xl">
        Fire<span className="text-ember-600 dark:text-ember-400">ground</span>
      </h1>
      <p className="mt-3 text-lg text-ground-400">
        Water supply and staging decision support for the fireground.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {user ? (
          <>
            <Link
              href="/app"
              className="rounded-md bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700"
            >
              Open Astra-FD
            </Link>
            <span className="text-sm text-ground-400">signed in as {user.email}</span>
          </>
        ) : (
          <a
            href="/signin"
            className="rounded-md bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700"
          >
            Sign in
          </a>
        )}
      </div>

      <footer className="mt-16 border-t border-ground-200 pt-4 font-[family-name:var(--font-mono)] text-xs text-ground-400 dark:border-ground-700">
        Built at the{' '}
        <a href="https://cerebralvalley.ai/e/openai-gpt-6-astra-nyc/details" className="underline underline-offset-4">
          OpenAI GPT-6 Astra Hackathon
        </a>
        {' '}· Cerebral Valley · NYC.
      </footer>
    </main>
  );
}
