import fs from 'node:fs';
import path from 'node:path';
import './globals.css';
import Nav from '@/components/Nav';

// Read a color primitive from globals.css so the theme color has a single source of truth.
function cssToken(name, fallback) {
  try {
    const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
    return css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

export const metadata = {
  title: 'Salasilah Keluarga Bolintok',
  description: 'Bolintok family day',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon.ico' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-icon.png' }],
  },
};

// --bg is --forest-950
const THEME_COLOR = cssToken('--forest-950', '#0e1020');
export const viewport = { width: 'device-width', initialScale: 1, themeColor: THEME_COLOR };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <Nav />
      </body>
    </html>
  );
}
