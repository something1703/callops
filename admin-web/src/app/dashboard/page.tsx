'use client';

import { useEffect, useState } from 'react';
import { getUser } from '@/lib/auth';
import Link from 'next/link';

interface Summary {
  total_contacts: number;
  active_assignments: number;
  calls_today: number;
  total_agents: number;
}

const featureCards = [
  {
    title: 'Contact Database',
    href: '/dashboard/contacts',
    description: 'Upload CSVs, filter by region, status, or tags, and build named datasets ready for assignment.',
    phase: 'Phase 2', color: '#818CF8',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Assignments',
    href: '/dashboard/assignments',
    description: 'Distribute filtered datasets to agents with full audit trail of who got what.',
    phase: 'Phase 2', color: '#4ADE80',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    title: 'Live Call Board',
    href: '/dashboard/live',
    description: 'See every agent on a call — contact, state, elapsed time. Refreshes every 5 seconds.',
    phase: 'Phase 3', color: '#FBBF24',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.37 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.1 6.1l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    title: 'Analytics & Audit',
    href: '/dashboard/audit',
    description: 'Leaderboards, call volume charts, recording playback, and the append-only audit trail.',
    phase: 'Phase 4', color: '#F87171',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

export default function DashboardPage() {
  const user = getUser();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('callops_token') ?? sessionStorage.getItem('callops_token') ?? '';
    fetch('/api/proxy/api/analytics/summary', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setSummary(data); })
      .catch(() => {}); // silent — KPIs just stay '—'
  }, []);

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Good {getGreeting()},{' '}
          <span className="text-gradient">{user?.name?.split(' ')[0] ?? 'Admin'}</span>
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          All four phases complete. CallOps is live.
        </p>
      </div>

      {/* ── Phase progress bar — all green ──────────────────────────────────── */}
      <div className="glass rounded-2xl p-4 mb-8 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm text-green-400 font-medium">All phases complete ✅</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex gap-3">
          {['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'].map((p) => (
            <div key={p} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-green-400">{p}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Live KPI tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Contacts', value: summary?.total_contacts?.toLocaleString() ?? '—', color: '#818CF8' },
          { label: 'Active Assignments', value: summary?.active_assignments?.toLocaleString() ?? '—', color: '#4ADE80' },
          { label: 'Calls Today', value: summary?.calls_today?.toLocaleString() ?? '—', color: '#FBBF24' },
          { label: 'Total Agents', value: summary?.total_agents?.toLocaleString() ?? '—', color: '#9CA3AF' },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Feature cards grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {featureCards.map((card) => (
          <Link key={card.title} href={card.href} style={{ textDecoration: 'none' }}>
            <div
              className="relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 transition-all duration-200 hover:border-white/20 cursor-pointer"
              style={{ background: '#0d1117' }}
            >
              <span className="absolute top-4 right-4 text-[10px] font-semibold px-2 py-1 rounded-lg bg-black/30 text-gray-400">
                {card.phase}
              </span>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${card.color}18`, color: card.color }}
              >
                {card.icon}
              </div>
              <h2 className="text-base font-semibold text-white mb-2">{card.title}</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{card.description}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium" style={{ color: card.color }}>
                Open →
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
