'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function NavBar() {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();

  const navItems = isAdmin
    ? [
        { href: '/admin', label: 'Admin' },
        { href: '/picks', label: 'Picks' },
        { href: '/leaderboard', label: 'Leaderboard' },
      ]
    : [
        { href: '/picks', label: 'Picks' },
        { href: '/leaderboard', label: 'Leaderboard' },
        { href: '/settings', label: 'Settings' },
      ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href={isAdmin ? '/admin' : '/picks'} className="font-bold text-lg text-white">
            🏈 CFB Pick&apos;em
          </Link>

          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {isAdmin ? 'Admin' : user ? `${user.first_name}` : ''}
            </span>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
