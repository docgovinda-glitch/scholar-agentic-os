import { Link } from "react-router-dom";

/** An address the app does not have. It says so, instead of quietly showing something else. */
export default function NotFoundScreen() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-[color:var(--text-secondary)]">Nothing lives at this address. It may have been moved, or the link may be mistyped.</p>
      <Link to="/projects" className="mt-2 inline-flex items-center min-h-11 px-4 rounded-full text-sm font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)]">
        Back to Workspace
      </Link>
    </main>
  );
}
