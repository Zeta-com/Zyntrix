import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="text-8xl font-bold green-text opacity-30">404</div>
      <h1 className="text-2xl font-bold text-foreground">Page Not Found</h1>
      <p className="text-muted-foreground max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <button className="mt-4 px-6 py-2 rounded-lg green-bg text-white font-medium hover:opacity-90 transition-opacity">
          Go Home
        </button>
      </Link>
    </div>
  );
}
