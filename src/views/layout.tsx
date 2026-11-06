import type { Child } from "hono/jsx";

export function Layout(props: { title: string; children: Child }) {
  return (
    <html lang="en-NZ">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#2f6b4f" />
        <title>{props.title} · Meals</title>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body>
        <main class="container">{props.children}</main>
        <script src="/app.js" defer></script>
      </body>
    </html>
  );
}
