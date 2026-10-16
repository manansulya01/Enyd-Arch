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
    // A private society should not be indexed. This is deliberate, not an
    // oversight: discoverability here means invitation, not search engines.
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
      <head>
        {/*
          The device-trait cookie carries coarse browser characteristics used to
          bind a session to one installation. It is written by an inline script
          before paint so the very first request already has a fingerprint.
        */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/enyd_device_traits=([^;]+)/);if(c&&c[1]&&c[1].length>40)return;var t={userAgent:navigator.userAgent,language:navigator.language||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'',screenWidth:window.screen.width, screenHeight:window.screen.height,hardwareConcurrency:navigator.hardwareConcurrency||0,colorDepth:window.screen.colorDepth||0};document.cookie='enyd_device_traits='+btoa(JSON.stringify(t))+';path=/;max-age=31536000;samesite=lax'+(location.protocol==='https:'?';secure':'');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}