'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

interface Dataset {
  id: string;
  name: string;
  contact_count: number;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
  email: string;
}

interface Assignment {
  id: string;
  contact_id: string;
  agent_id: string;
  assigned_by: string;
  status: 'active' | 'completed' | 'reassigned';
  assigned_at: string;
  contact_full_name: string;
  contact_phone: string;
  contact_status: string;
  agent_name: string;
  agent_email: string;
}

const ASSIGNMENT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20',
  completed: 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20',
  reassigned: 'bg-amber-600/10 text-amber-400 border border-amber-500/20',
};

export default function AssignmentsPage() {
  const router = useRouter();

  // State lists
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Form State
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [distribution, setDistribution] = useState<'even' | 'all'>('even');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Pagination State for History
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage] = useState(20);

  // Action State (Reassigning/Updating)
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reassignAgentId, setReassignAgentId] = useState('');

  // Fetch datasets and agents
  const fetchMetadata = async () => {
    setIsLoadingLists(true);
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      // Fetch Datasets
      const dsRes = await fetch('/api/proxy/api/datasets', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const dsData = await dsRes.json();
      setDatasets(dsData.datasets || []);

      // Fetch Agents
      const agentsRes = await fetch('/api/proxy/api/users/agents', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const agentsData = await agentsRes.json();
      setAgents(agentsData.agents || []);
    } catch (err) {
      console.error('Error fetching metadata:', err);
    } finally {
      setIsLoadingLists(false);
    }
  };

  // Fetch recent assignments history
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/proxy/api/assignments?page=${currentPage}&per_page=${perPage}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setRecentAssignments(data.assignments || []);
    } catch (err) {
      console.error('Error fetching assignment history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [currentPage]);

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleCreateAssignment = async () => {
    if (!selectedDatasetId || selectedAgentIds.length === 0) return;

    setIsAssigning(true);
    setAssignError('');
    setAssignSuccess(false);

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch('/api/proxy/api/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          dataset_id: selectedDatasetId,
          agent_ids: selectedAgentIds,
          distribution,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to assign dataset.');
      }

      setAssignSuccess(true);
      setSelectedDatasetId('');
      setSelectedAgentIds([]);
      setShowConfirmModal(false);
      fetchHistory(); // refresh history table

      setTimeout(() => {
        setAssignSuccess(false);
      }, 3000);
    } catch (err: unknown) {
      setAssignError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setIsAssigning(false);
    }
  };

  // Update assignment status or reassign
  const handleUpdateAssignment = async (id: string, status?: 'completed', newAgentId?: string) => {
    setIsUpdating(true);
    setActionError('');
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/proxy/api/assignments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          new_agent_id: newAgentId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to update assignment.');
      }

      setUpdatingAssignmentId(null);
      setReassignAgentId('');
      fetchHistory(); // refresh history
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to perform update.');
    } finally {
      setIsUpdating(false);
    }
  };

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Assignments Panel</h1>
        <p className="text-gray-400 mt-1">
          Distribute and route contacts to sales agents dynamically.
        </p>
      </div>

      {/* Grid container: Form on left, history on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Create Assignment Form */}
        <div className="lg:col-span-1 bg-gray-900 border border-white/[0.06] rounded-2xl p-6 shadow-xl space-y-6 self-start">
          <div className="border-b border-white/[0.04] pb-4">
            <h3 className="text-lg font-bold text-white">New Assignment</h3>
            <p className="text-xs text-gray-500 mt-1">Select a dataset and allocate contacts.</p>
          </div>

          {assignSuccess && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl">
              ✓ Dataset successfully assigned! Active in agent apps.
            </div>
          )}

          {assignError && (
            <div className="p-4 bg-red-950/40 border border-red-500/20 text-red-400 text-sm rounded-xl">
              ❌ {assignError}
            </div>
          )}

          <div className="space-y-4">
            {/* Dataset Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400">1. Select Lead Dataset</label>
              {isLoadingLists ? (
                <div className="h-10 bg-white/[0.02] rounded-xl animate-pulse" />
              ) : (
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm text-gray-200 bg-white/[0.03] border border-white/[0.08] focus:border-indigo-500 rounded-xl focus:outline-none transition-all"
                >
                  <option value="" className="bg-gray-950">-- Select a dataset --</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id} className="bg-gray-950">
                      {d.name} ({d.contact_count} contacts)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Agent Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400">2. Assign to Agents</label>
              {isLoadingLists ? (
                <div className="h-32 bg-white/[0.02] rounded-xl animate-pulse" />
              ) : agents.length === 0 ? (
                <p className="text-xs text-gray-500">No active agents found. Seed users first.</p>
              ) : (
                <div className="border border-white/[0.08] bg-white/[0.02] rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
                  {agents.map((agent) => (
                    <label
                      key={agent.id}
                      className="flex items-center gap-3 text-sm text-gray-300 hover:text-white cursor-pointer py-1.5 px-2 hover:bg-white/[0.03] rounded-lg transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.includes(agent.id)}
                        onChange={() => toggleAgentSelection(agent.id)}
                        className="rounded border-white/[0.1] bg-gray-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                      />
                      <div>
                        <p className="font-semibold leading-tight">{agent.name}</p>
                        <p className="text-[10px] text-gray-500">{agent.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Distribution Method */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400">3. Distribution Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDistribution('even')}
                  className={`
                    py-3 text-xs font-bold rounded-xl border transition-all
                    ${distribution === 'even'
                      ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/30 shadow-md shadow-indigo-600/5'
                      : 'text-gray-400 bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]'
                    }
                  `}
                >
                  Even Split (Round-Robin)
                </button>
                <button
                  type="button"
                  onClick={() => setDistribution('all')}
                  className={`
                    py-3 text-xs font-bold rounded-xl border transition-all
                    ${distribution === 'all'
                      ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/30 shadow-md shadow-indigo-600/5'
                      : 'text-gray-400 bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]'
                    }
                  `}
                >
                  Assign to All
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                {distribution === 'even'
                  ? 'Distributes contacts sequentially to selected agents. No agent gets the same contact.'
                  : 'Assigns all contacts to every single agent selected. Contacts appear in all agent lists.'}
              </p>
            </div>

            {/* Submit Trigger */}
            <button
              id="btn-trigger-assign"
              type="button"
              disabled={!selectedDatasetId || selectedAgentIds.length === 0}
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-3 text-sm font-bold text-white gradient-brand rounded-xl hover:brightness-110 disabled:opacity-30 transition-all flex items-center justify-center gap-2"
            >
              Distribute Contacts
            </button>
          </div>
        </div>

        {/* Right Side: Assignment History List */}
        <div className="lg:col-span-2 bg-gray-900 border border-white/[0.06] rounded-2xl shadow-xl overflow-hidden self-start">
          <div className="p-6 border-b border-white/[0.06] bg-white/[0.01]">
            <h3 className="text-lg font-bold text-white">Active Assignments</h3>
            <p className="text-xs text-gray-500 mt-1">Tracks contact assignments and performance status.</p>
          </div>

          {actionError && (
            <div className="m-6 p-3 bg-red-950/40 border border-red-500/20 text-red-400 text-xs rounded-xl">
              {actionError}
            </div>
          )}

          {isLoadingHistory ? (
            <div className="p-8 space-y-4">
              <div className="h-6 bg-white/[0.02] rounded w-1/3 animate-pulse" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-white/[0.01] rounded animate-pulse" />
                ))}
              </div>
            </div>
          ) : recentAssignments.length === 0 ? (
            <div className="p-16 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center text-gray-500 mx-auto">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-white">No active assignments</h4>
              <p className="text-xs text-gray-500">Select a dataset and agents on the left to create active tasks.</p>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.01] text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-6 py-4">Contact</th>
                      <th className="px-6 py-4">Assigned Agent</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Assigned At</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {recentAssignments.map((assignment) => (
                      <tr key={assignment.id} className="hover:bg-white/[0.01] transition-all text-gray-300">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-white">{assignment.contact_full_name}</p>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">{assignment.contact_phone}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-white">{assignment.agent_name}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{assignment.agent_email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${ASSIGNMENT_STATUS_COLORS[assignment.status]}`}>
                            {assignment.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {new Date(assignment.assigned_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {assignment.status === 'active' && (
                            <>
                              <button
                                onClick={() => handleUpdateAssignment(assignment.id, 'completed')}
                                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/10 transition-all"
                              >
                                Done
                              </button>
                              <button
                                onClick={() => setUpdatingAssignmentId(assignment.id)}
                                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2.5 py-1.5 rounded-lg border border-indigo-500/10 transition-all"
                              >
                                Reassign
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Simple Pagination */}
              <div className="flex justify-between items-center px-6 py-4 border-t border-white/[0.06] bg-white/[0.01]">
                <span className="text-xs text-gray-500">Page {currentPage}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-xs text-gray-400 bg-white/[0.02] border border-white/[0.06] rounded-lg disabled:opacity-30 hover:text-white hover:bg-white/[0.04] transition-all"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={recentAssignments.length < perPage}
                    className="px-3 py-1.5 text-xs text-gray-400 bg-white/[0.02] border border-white/[0.06] rounded-lg disabled:opacity-30 hover:text-white hover:bg-white/[0.04] transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/[0.08] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-bold text-white">Confirm Assignment</h3>
              <p className="text-gray-400 text-sm mt-1">
                You are about to distribute contacts from <span className="font-bold text-gray-200">&ldquo;{selectedDataset.name}&rdquo;</span>.
              </p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-2 text-sm text-gray-300">
              <div>• Contacts to assign: <span className="font-bold text-white">{selectedDataset.contact_count}</span></div>
              <div>• Selected agents: <span className="font-bold text-white">{selectedAgentIds.length}</span></div>
              <div>• Distribution logic: <span className="font-bold text-indigo-400 uppercase">{distribution}</span></div>
              {distribution === 'even' && (
                <div className="text-xs text-gray-500">
                  Each agent will receive ~{Math.ceil(selectedDataset.contact_count / selectedAgentIds.length)} contacts.
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2 text-sm font-semibold text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-assign"
                onClick={handleCreateAssignment}
                disabled={isAssigning}
                className="flex-1 py-2 text-sm font-semibold text-white gradient-brand rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center"
              >
                {isAssigning ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Confirm & Assign'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Agent Selection Modal */}
      {updatingAssignmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/[0.08] w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white font-sans">Reassign Lead</h3>
              <p className="text-gray-400 text-xs mt-1">Select a new agent to work on this contact assignment.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400">Select New Agent</label>
              <select
                value={reassignAgentId}
                onChange={(e) => setReassignAgentId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm text-gray-200 bg-white/[0.03] border border-white/[0.08] focus:border-indigo-500 rounded-xl focus:outline-none transition-all"
              >
                <option value="" className="bg-gray-950">-- Select Agent --</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id} className="bg-gray-950">
                    {a.name} ({a.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setUpdatingAssignmentId(null); setReassignAgentId(''); }}
                className="flex-1 py-2 text-sm font-semibold text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-reassign"
                onClick={() => handleUpdateAssignment(updatingAssignmentId, undefined, reassignAgentId)}
                disabled={isUpdating || !reassignAgentId}
                className="flex-1 py-2 text-sm font-semibold text-white gradient-brand rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center"
              >
                {isUpdating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Reassign'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
