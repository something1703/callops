'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallRecord {
  call_id: string;
  agent_name: string;
  contact_name: string;
  phone_number: string;
  state: string;
  ended_at: string;
  talk_duration_seconds: number | null;
  ring_duration_seconds: number | null;
  has_recording: boolean;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [presignLoading, setPresignLoading] = useState<string | null>(null);

  const token = typeof window !== 'undefined'
    ? localStorage.getItem('callops_token') ?? sessionStorage.getItem('callops_token') ?? ''
    : '';

  useEffect(() => {
    fetch('/api/proxy/api/analytics/recent-calls?per_page=100', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setCalls(data.calls ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handlePlayback = async (callId: string) => {
    if (playingCallId === callId) {
      // Toggle off
      setPlayingCallId(null);
      setPlaybackUrl(null);
      return;
    }
    setPresignLoading(callId);
    try {
      const res = await fetch(`/api/proxy/api/analytics/recording/${callId}/presign`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      setPlayingCallId(callId);
      setPlaybackUrl(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to load recording');
    } finally {
      setPresignLoading(null);
    }
  };

  return (
    <div style={{ padding: '0 4px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Call History</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4B5563' }}>
          Most recent 100 completed calls &middot; click &#9654; to play a recording
        </p>
      </div>

      {/* ── Audio player strip ──────────────────────────────────────────────── */}
      {playingCallId && playbackUrl && (
        <div style={{
          background: '#111827', border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 600 }}>
            ▶ Playing — {calls.find((c) => c.call_id === playingCallId)?.contact_name ?? 'Call'}
          </span>
          <audio
            src={playbackUrl}
            controls
            autoPlay
            style={{ flex: 1, height: 32 }}
            onEnded={() => { setPlayingCallId(null); setPlaybackUrl(null); }}
          />
          <button
            onClick={() => { setPlayingCallId(null); setPlaybackUrl(null); }}
            style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: '12px 16px', color: '#F87171', marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <p style={{ color: '#374151', fontSize: 13 }}>Loading calls…</p>
        </div>
      )}

      {/* ── Calls table ─────────────────────────────────────────────────────── */}
      {!loading && calls.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#374151' }}>
          <p style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No calls recorded yet</p>
          <p style={{ fontSize: 13 }}>Once agents start placing calls, they&apos;ll appear here.</p>
        </div>
      )}

      {!loading && calls.length > 0 && (
        <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Contact', 'Phone', 'Agent', 'State', 'Talk', 'Ring', 'Date', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: '#4B5563', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr
                    key={call.call_id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: playingCallId === call.call_id ? 'rgba(129,140,248,0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 14px', color: '#e5e7eb', fontWeight: 500 }}>{call.contact_name}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontFamily: 'monospace', fontSize: 12 }}>{call.phone_number}</td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{call.agent_name}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <StateChip state={call.state} />
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4ADE80', fontFamily: 'monospace' }}>
                      {call.talk_duration_seconds != null ? formatDuration(call.talk_duration_seconds) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF', fontFamily: 'monospace' }}>
                      {call.ring_duration_seconds != null ? formatDuration(call.ring_duration_seconds) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4B5563', whiteSpace: 'nowrap' }}>
                      {new Date(call.ended_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {call.has_recording ? (
                        <button
                          id={`btn-play-${call.call_id.slice(0, 8)}`}
                          onClick={() => handlePlayback(call.call_id)}
                          disabled={presignLoading === call.call_id}
                          style={{
                            background: playingCallId === call.call_id ? 'rgba(129,140,248,0.2)' : 'rgba(129,140,248,0.1)',
                            border: '1px solid rgba(129,140,248,0.3)',
                            borderRadius: 7, padding: '4px 10px',
                            color: '#818CF8', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            transition: 'all 0.15s',
                          }}
                        >
                          {presignLoading === call.call_id ? '…' : playingCallId === call.call_id ? '■ Stop' : '▶ Play'}
                        </button>
                      ) : (
                        <span style={{ color: '#1F2937', fontSize: 11 }}>No rec</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── State chip ────────────────────────────────────────────────────────────────

function StateChip({ state }: { state: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    ended:  { bg: 'rgba(74,222,128,0.1)',   text: '#4ADE80' },
    failed: { bg: 'rgba(248,113,113,0.1)',  text: '#F87171' },
    active: { bg: 'rgba(251,191,36,0.1)',   text: '#FBBF24' },
  };
  const c = colors[state] ?? { bg: 'rgba(107,114,128,0.1)', text: '#6B7280' };
  return (
    <span style={{ background: c.bg, color: c.text, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {state}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
