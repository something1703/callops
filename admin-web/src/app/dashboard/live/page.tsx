'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveCall {
  call_id: string;
  agent_id: string;
  agent_name: string;
  contact_id: string;
  contact_name: string;
  phone_number: string;
  state: 'dialing' | 'ringing' | 'active';
  started_at: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LivePage() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Tick every second to update elapsed times client-side
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchLiveCalls = async () => {
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('callops_token') ?? sessionStorage.getItem('callops_token')
        : null;

      const res = await fetch('/api/proxy/calls/live', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCalls(data.calls ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  // Initial load + 5-second poll
  useEffect(() => {
    fetchLiveCalls();
    const id = setInterval(fetchLiveCalls, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh', background: '#030712' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>
            Live Call Board
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4B5563' }}>
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString()}`
              : 'Loading…'}
            &nbsp;·&nbsp;Auto-refresh every 5s
          </p>
        </div>
        {/* Live pulse indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LiveDot />
          <span style={{ fontSize: 13, color: '#9CA3AF' }}>
            {calls.length} active {calls.length === 1 ? 'call' : 'calls'}
          </span>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 12,
          padding: '12px 16px',
          color: '#F87171',
          fontSize: 13,
          marginBottom: 20,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 148, borderRadius: 16, background: '#111827', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!loading && calls.length === 0 && !error && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingTop: 100,
          paddingBottom: 100,
        }}>
          <div style={{ position: 'relative', width: 72, height: 72 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(74,222,128,0.1)',
              animation: 'liveRing 2s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 10, borderRadius: '50%',
              background: 'rgba(74,222,128,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 24 }}>📵</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#fff' }}>No active calls right now</p>
          <p style={{ margin: 0, fontSize: 13, color: '#4B5563', textAlign: 'center', maxWidth: 320 }}>
            This board will update automatically when agents start calls.
            <br />Polling every 5 seconds.
          </p>
        </div>
      )}

      {/* ── Live call cards ─────────────────────────────────────────────────── */}
      {!loading && calls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {calls.map((call) => (
            <CallCard key={call.call_id} call={call} tick={tick} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes liveRing {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.25); opacity: 0.2; }
        }
        @keyframes liveDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ── Call card ─────────────────────────────────────────────────────────────────

function CallCard({ call, tick }: { call: LiveCall; tick: number }) {
  const isActive = call.state === 'active';
  const isRinging = call.state === 'ringing';

  const borderColor = isActive ? '#4ADE80' : isRinging ? '#FBBF24' : '#818CF8';
  const stateLabel = isActive ? 'Active' : isRinging ? 'Ringing' : 'Dialing';
  const stateBg = isActive ? 'rgba(74,222,128,0.12)' : isRinging ? 'rgba(251,191,36,0.12)' : 'rgba(129,140,248,0.12)';
  const stateColor = isActive ? '#4ADE80' : isRinging ? '#FBBF24' : '#818CF8';

  const elapsed = getElapsedSeconds(call.started_at, tick);
  const elapsedStr = formatElapsed(elapsed);

  return (
    <div style={{
      background: '#111827',
      borderRadius: 16,
      border: `1px solid rgba(255,255,255,0.06)`,
      borderLeft: `4px solid ${borderColor}`,
      padding: 20,
      transition: 'border-color 0.3s',
    }}>
      {/* State + elapsed */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: stateColor,
          background: stateBg,
          borderRadius: 6, padding: '3px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {isRinging && <span style={{ animation: 'liveDot 1s ease-in-out infinite', display: 'inline-block' }}>●</span>}
          {isActive && <span>●</span>}
          {stateLabel}
        </span>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 16,
          fontWeight: 700,
          color: isActive ? '#4ADE80' : '#9CA3AF',
        }}>
          {isActive ? elapsedStr : '—'}
        </span>
      </div>

      {/* Contact info */}
      <div style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>{call.contact_name}</p>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6B7280' }}>{call.phone_number}</p>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />

      {/* Agent */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'rgba(129,140,248,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#818CF8',
        }}>
          {call.agent_name.charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>{call.agent_name}</span>
      </div>
    </div>
  );
}

// ── Live dot ──────────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <div style={{ position: 'relative', width: 10, height: 10 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: '#4ADE80',
        animation: 'liveDot 1.2s ease-in-out infinite',
      }} />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getElapsedSeconds(startedAt: string, tick: number): number {
  void tick; // tick triggers re-render so elapsed time updates
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 1000));
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
