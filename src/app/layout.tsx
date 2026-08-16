import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import PopupChecker from '@/components/PopupChecker';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CFB Pick\'em',
  description: 'College Football Pick\'em with friends',
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
        </AuthProvider>
      </body>
    </html>
  );
}
