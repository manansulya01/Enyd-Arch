import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Enyd Arch — a private digital society for students',
    template: '%s · Enyd Arch',
  },
  description:
    'Enyd Arch is a private digital society for students. Talk to people, exchange things, build things, discover things.',
  applicationName: 'Enyd Arch',
  referrer: 'strict-origin-when-cross-origin',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    icon: [{ url: '/mark.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Enyd Arch',
    title: 'Enyd Arch — a private digital society for students',
    description: 'Enter quietly. Discover freely.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0d14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head />
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
