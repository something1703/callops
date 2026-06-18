'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  total_contacts: number;
  active_assignments: number;
  calls_today: number;
  calls_this_week: number;
  calls_this_month: number;
  avg_talk_seconds: number;
  total_agents: number;
}

interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  agent_name: string;
  call_count: number;
  avg_talk_seconds: number;
  total_talk_seconds: number;
}

interface DaySeries {
  date: string;
  call_count: number;
  avg_talk_seconds: number;
}

interface AuditEntry {
  id: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [series, setSeries] = useState<DaySeries[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('callops_token') ?? sessionStorage.getItem('callops_token') ?? '';
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch('/api/proxy/analytics/summary', { headers }).then((r) => r.json()),
      fetch('/api/proxy/analytics/calls-by-agent?days=30', { headers }).then((r) => r.json()),
      fetch('/api/proxy/analytics/calls-over-time?days=30', { headers }).then((r) => r.json()),
      fetch('/api/proxy/analytics/audit-log?per_page=50', { headers }).then((r) => r.json()),
    ])
      .then(([s, lb, ts, al]) => {
        setSummary(s);
        setLeaderboard(lb.leaderboard ?? []);
        setSeries(ts.series ?? []);
        setAuditLog(al.entries ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div style={{ padding: '0 4px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Analytics & Audit</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4B5563' }}>
          30-day window · live data from Postgres
        </p>
      </div>

      {/* ── KPI tiles ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        <KPITile label="Total Contacts" value={summary?.total_contacts?.toLocaleString() ?? '—'} color="#818CF8" />
        <KPITile label="Active Assignments" value={summary?.active_assignments?.toLocaleString() ?? '—'} color="#4ADE80" />
        <KPITile label="Calls Today" value={summary?.calls_today?.toLocaleString() ?? '—'} color="#FBBF24" />
        <KPITile label="Calls This Week" value={summary?.calls_this_week?.toLocaleString() ?? '—'} color="#818CF8" />
        <KPITile label="Avg Talk Time" value={summary ? formatDuration(summary.avg_talk_seconds) : '—'} color="#4ADE80" />
        <KPITile label="Total Agents" value={summary?.total_agents?.toLocaleString() ?? '—'} color="#6B7280" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* ── Calls over time chart ─────────────────────────────────────── */}
        <Section title="Daily Call Volume (30 days)">
          {series.length === 0
            ? <Empty text="No calls recorded yet" />
            : <BarChart data={series} />
          }
        </Section>

        {/* ── Agent leaderboard ─────────────────────────────────────────── */}
        <Section title="Agent Leaderboard (30 days)">
          {leaderboard.length === 0
            ? <Empty text="No call data yet" />
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#4B5563', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Agent</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>Calls</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>Avg Talk</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>Total Talk</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row) => (
                    <tr key={row.agent_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 8px', color: row.rank === 1 ? '#FBBF24' : '#4B5563', fontWeight: row.rank === 1 ? 700 : 400 }}>
                        {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank}
                      </td>
                      <td style={{ padding: '8px 8px', color: '#e5e7eb' }}>{row.agent_name}</td>
                      <td style={{ padding: '8px 8px', color: '#818CF8', textAlign: 'right', fontWeight: 600 }}>{row.call_count}</td>
                      <td style={{ padding: '8px 8px', color: '#9CA3AF', textAlign: 'right' }}>{formatDuration(row.avg_talk_seconds)}</td>
                      <td style={{ padding: '8px 8px', color: '#4ADE80', textAlign: 'right' }}>{formatDuration(row.total_talk_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Section>
      </div>

      {/* ── Audit log ──────────────────────────────────────────────────────── */}
      <Section title="Recent Audit Log (last 50 entries)">
        {auditLog.length === 0
          ? <Empty text="No audit entries yet" />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                <thead>
                  <tr style={{ color: '#4B5563', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Time', 'Actor', 'Action', 'Target'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '7px 10px', color: '#4B5563', whiteSpace: 'nowrap' }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#9CA3AF' }}>{entry.actor_name}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{
                          background: actionColor(entry.action).bg,
                          color: actionColor(entry.action).text,
                          borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 500,
                        }}>
                          {entry.action}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', color: '#6B7280', fontFamily: 'monospace', fontSize: 11 }}>
                        {entry.target_type && `${entry.target_type}`}
                        {entry.target_id && ` · ${entry.target_id.slice(0, 8)}…`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPITile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: '#111827', borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.06)',
      padding: '16px 18px',
    }}>
      <p style={{ margin: 0, fontSize: 11, color: '#4B5563', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16, padding: 20,
    }}>
      <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ color: '#374151', fontSize: 13, margin: '20px 0', textAlign: 'center' }}>{text}</p>;
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: '#4B5563', fontSize: 14 }}>Loading analytics…</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: 16, color: '#F87171', margin: 20 }}>
      ⚠️ Failed to load analytics: {message}
    </div>
  );
}

// ── Bar chart (vanilla SVG) ───────────────────────────────────────────────────

function BarChart({ data }: { data: DaySeries[] }) {
  const max = Math.max(...data.map((d) => d.call_count), 1);
  const H = 120;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${data.length * 18} ${H + 24}`} style={{ width: '100%', minWidth: 300, height: H + 24 }}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.call_count / max) * H));
          const x = i * 18 + 5;
          const y = H - barH;
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={8} height={barH} rx={2} fill={d.call_count > 0 ? '#6366F1' : '#1F2937'} opacity={0.9} />
              {d.call_count > 0 && (
                <text x={x + 4} y={y - 3} textAnchor="middle" fill="#818CF8" fontSize={6}>{d.call_count}</text>
              )}
            </g>
          );
        })}
        {/* X-axis labels — show every 5th */}
        {data.map((d, i) => {
          if (i % 5 !== 0) return null;
          return (
            <text key={d.date} x={i * 18 + 9} y={H + 16} textAnchor="middle" fill="#374151" fontSize={6}>
              {d.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function actionColor(action: string): { bg: string; text: string } {
  if (action.includes('login')) return { bg: 'rgba(74,222,128,0.1)', text: '#4ADE80' };
  if (action.includes('call')) return { bg: 'rgba(129,140,248,0.1)', text: '#818CF8' };
  if (action.includes('assign')) return { bg: 'rgba(251,191,36,0.1)', text: '#FBBF24' };
  if (action.includes('upload') || action.includes('ingest')) return { bg: 'rgba(99,102,241,0.1)', text: '#818CF8' };
  return { bg: 'rgba(107,114,128,0.1)', text: '#6B7280' };
}
