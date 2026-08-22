import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import PopupChecker from '@/components/PopupChecker';
import InstallHint from '@/components/InstallHint';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CFB Pick\'em',
  description: 'College Football Pick\'em with friends',
  appleWebApp: {
    title: 'CFB Pick\'em',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#030712',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <AuthProvider>
          <PopupChecker>
            {children}
          </PopupChecker>
          <InstallHint />
        </AuthProvider>
      </body>
    </html>
  );
}
