import type { Child } from "hono/jsx";
import type { User } from "../db/schema.js";

export type Tab = "meals" | "day" | "shop" | "settings";

export type LayoutProps = {
  title: string;
  user?: User | null;
  tab?: Tab;
  children: Child;
};

const icons: Record<Tab, Child> = {
  meals: <path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v6M10 3v8a3 3 0 0 1-3 3M17 21V3c-2 0-4 3-4 7s2 5 4 5" />,
  day: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  shop: <path d="M5 7h14l-1.5 12h-11L5 7zM9 7V5a3 3 0 0 1 6 0v2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
};

const tabs: { id: Tab; href: string; label: string }[] = [
  { id: "meals", href: "/meals", label: "Meals" },
  { id: "day", href: "/days", label: "Days" },
  { id: "shop", href: "/shopping", label: "Shopping" },
  { id: "settings", href: "/settings", label: "Settings" },
];

export function Layout(props: LayoutProps) {
  return (
    <html lang="en-NZ">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#2f6b4f" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Meals" />
        <title>{`${props.title} · Meals`}</title>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body>
        <a class="sr-only" href="#main">Skip to content</a>
        <main id="main" class="container">{props.children}</main>
        {props.user ? (
          <nav class="tabbar" aria-label="Main">
            {tabs.map((t) => (
              <a href={t.href} aria-current={props.tab === t.id ? "page" : undefined}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  {icons[t.id]}
                </svg>
                {t.label}
              </a>
            ))}
          </nav>
        ) : null}
        <script src="/app.js" defer></script>
      </body>
    </html>
  );
}

export function Csrf(props: { token: string }) {
  return <input type="hidden" name="_csrf" value={props.token} />;
}
