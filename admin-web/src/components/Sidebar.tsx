'use client';

import Link from 'next/link';
import { type AuthUser } from '@/lib/api';

interface NavItem {
  href: string;
  label: string;
  phase: string;
  icon: React.ReactNode;
  available: boolean;
}

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    phase: '',
    available: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/dashboard/contacts',
    label: 'Contacts',
    phase: 'Phase 2',
    available: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/dashboard/assignments',
    label: 'Assignments',
    phase: 'Phase 2',
    available: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: '/dashboard/live',
    label: 'Live Board',
    phase: 'Phase 3',
    available: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.37 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.1 6.1l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/calls',
    label: 'Call History',
    phase: 'Phase 4',
    available: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: '/dashboard/audit',
    label: 'Audit Log',
    phase: 'Phase 4',
    available: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

interface SidebarProps {
  user: AuthUser | null;
  currentPath: string;
  onSignOut: () => void;
}

export default function Sidebar({ user, currentPath, onSignOut }: SidebarProps) {
  const isExact = (href: string) =>
    href === '/dashboard' ? currentPath === '/dashboard' : currentPath.startsWith(href);

  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-white/[0.06] bg-gray-950">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
        <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shadow-md shadow-indigo-500/30">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white">
            <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">CallOps</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Admin Panel</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = isExact(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${active
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : item.available
                  ? 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.05]'
                  : 'text-gray-600 cursor-not-allowed pointer-events-none'
                }
              `}
              aria-current={active ? 'page' : undefined}
            >
              <span className={`shrink-0 transition-colors ${active ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.phase && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                  active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/[0.04] text-gray-600'
                }`}>
                  {item.phase}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User profile + sign out */}
      <div className="px-3 pb-4 border-t border-white/[0.06] pt-3">
        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-gray-200 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
            <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 font-medium capitalize">
              {user.role}
            </span>
          </div>
        )}
        <button
          id="btn-sign-out"
          onClick={onSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
