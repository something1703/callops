'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

interface Contact {
  id: string;
  full_name: string;
  phone_number: string;
  region: string | null;
  status: 'new' | 'contacted' | 'interested' | 'not_interested' | 'converted' | 'do_not_call';
  tags: string[];
  created_at: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  not_interested: 'Not Interested',
  converted: 'Converted',
  do_not_call: 'Do Not Call',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20',
  contacted: 'bg-blue-600/10 text-blue-400 border border-blue-500/20',
  interested: 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20',
  not_interested: 'bg-amber-600/10 text-amber-400 border border-amber-500/20',
  converted: 'bg-teal-600/10 text-teal-400 border border-teal-500/20',
  do_not_call: 'bg-rose-600/10 text-rose-400 border border-rose-500/20',
};

export default function ContactsPage() {
  const router = useRouter();
  
  // Data State
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  
  // Filters State
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  // Applied Filters State (For trigger fetch and chips)
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedRegion, setAppliedRegion] = useState('');
  const [appliedTag, setAppliedTag] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');

  // Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [isSavingDataset, setIsSavingDataset] = useState(false);
  const [saveDatasetError, setSaveDatasetError] = useState('');
  const [saveDatasetSuccess, setSaveDatasetSuccess] = useState(false);

  // Fetch Contacts
  const fetchContacts = async () => {
    setIsLoading(true);
    setIsError(false);
    
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      const queryParams = new URLSearchParams();
      queryParams.set('page', currentPage.toString());
      queryParams.set('per_page', perPage.toString());
      if (appliedStatus) queryParams.set('status', appliedStatus);
      if (appliedRegion) queryParams.set('region', appliedRegion);
      if (appliedTag) queryParams.set('tag', appliedTag);
      if (appliedSearch) queryParams.set('q', appliedSearch);

      const res = await fetch(`/api/proxy/api/contacts?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to fetch contacts');
      
      const result = await res.json();
      setContactsList(result.data || []);
      setMeta(result.meta || null);
    } catch (err) {
      console.error(err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [currentPage, perPage, appliedSearch, appliedRegion, appliedTag, appliedStatus]);

  // Apply filters handler
  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAppliedSearch(search);
    setAppliedRegion(regionFilter);
    setAppliedTag(tagFilter);
    setAppliedStatus(statusFilter);
    setCurrentPage(1);
  };

  // Reset filters handler
  const handleClearAll = () => {
    setSearch('');
    setRegionFilter('');
    setTagFilter('');
    setStatusFilter('');
    setAppliedSearch('');
    setAppliedRegion('');
    setAppliedTag('');
    setAppliedStatus('');
    setCurrentPage(1);
  };

  // Remove individual filter chip
  const handleRemoveChip = (filterType: 'search' | 'region' | 'tag' | 'status') => {
    if (filterType === 'search') {
      setSearch('');
      setAppliedSearch('');
    } else if (filterType === 'region') {
      setRegionFilter('');
      setAppliedRegion('');
    } else if (filterType === 'tag') {
      setTagFilter('');
      setAppliedTag('');
    } else if (filterType === 'status') {
      setStatusFilter('');
      setAppliedStatus('');
    }
    setCurrentPage(1);
  };

  // Save Dataset API Call
  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetName.trim()) {
      setSaveDatasetError('Please provide a dataset name.');
      return;
    }

    setIsSavingDataset(true);
    setSaveDatasetError('');
    setSaveDatasetSuccess(false);

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch('/api/proxy/api/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: datasetName.trim(),
          filters: {
            status: appliedStatus || undefined,
            region: appliedRegion || undefined,
            tag: appliedTag || undefined,
            q: appliedSearch || undefined,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to save dataset.');
      }

      setSaveDatasetSuccess(true);
      setDatasetName('');
      setTimeout(() => {
        setIsSaveModalOpen(false);
        setSaveDatasetSuccess(false);
      }, 1500);

    } catch (err: unknown) {
      setSaveDatasetError(err instanceof Error ? err.message : 'Failed to create dataset.');
    } finally {
      setIsSavingDataset(false);
    }
  };

  const hasActiveFilters = appliedSearch || appliedRegion || appliedTag || appliedStatus;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Contact Database</h1>
          <p className="text-gray-400 mt-1">
            Search, filter, and segment your lead lists into reusable datasets.
          </p>
        </div>
        <div className="flex gap-3">
          {meta && meta.total > 0 && (
            <button
              id="btn-save-dataset"
              onClick={() => setIsSaveModalOpen(true)}
              className="px-4 py-2.5 text-sm font-semibold text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600/35 border border-indigo-500/20 rounded-xl transition-all"
            >
              Save View as Dataset
            </button>
          )}
          <Link
            id="btn-goto-upload"
            href="/dashboard/contacts/upload"
            className="px-4 py-2.5 text-sm font-bold text-white gradient-brand rounded-xl hover:brightness-110 active:brightness-95 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload CSV
          </Link>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-5 shadow-xl space-y-4">
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Query */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full px-3 py-2 text-sm text-gray-200 bg-white/[0.03] border border-white/[0.08] focus:border-indigo-500 rounded-xl focus:outline-none transition-all placeholder-gray-600"
            />
          </div>

          {/* Region */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400">Region</label>
            <input
              type="text"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              placeholder="e.g. California, Delhi..."
              className="w-full px-3 py-2 text-sm text-gray-200 bg-white/[0.03] border border-white/[0.08] focus:border-indigo-500 rounded-xl focus:outline-none transition-all placeholder-gray-600"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400">Tag</label>
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="e.g. sales, technology..."
              className="w-full px-3 py-2 text-sm text-gray-200 bg-white/[0.03] border border-white/[0.08] focus:border-indigo-500 rounded-xl focus:outline-none transition-all placeholder-gray-600"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-end gap-3">
            <button
              id="btn-apply-filters"
              type="submit"
              className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all"
            >
              Filter
            </button>
            {hasActiveFilters && (
              <button
                id="btn-clear-filters"
                type="button"
                onClick={handleClearAll}
                className="px-3 py-2 text-sm font-semibold text-gray-400 hover:text-white bg-white/[0.03] border border-white/[0.08] rounded-xl hover:bg-white/[0.06] transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {/* Status filtering tabs */}
        <div className="border-t border-white/[0.04] pt-4">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold text-gray-400 self-center mr-2">Status:</span>
            <button
              onClick={() => { setStatusFilter(''); setAppliedStatus(''); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                !appliedStatus ? 'bg-indigo-600 text-white' : 'text-gray-400 bg-white/[0.02] hover:bg-white/[0.05]'
              }`}
            >
              All
            </button>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setStatusFilter(key); setAppliedStatus(key); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  appliedStatus === key ? 'bg-indigo-600 text-white' : 'text-gray-400 bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter chips indicator */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 border-t border-white/[0.04] pt-3">
            <span className="text-xs text-gray-500 self-center">Active filters:</span>
            {appliedSearch && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] text-xs text-gray-300 border border-white/[0.06]">
                Query: &ldquo;{appliedSearch}&rdquo;
                <button type="button" onClick={() => handleRemoveChip('search')} className="text-gray-500 hover:text-gray-300">
                  &times;
                </button>
              </span>
            )}
            {appliedRegion && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] text-xs text-gray-300 border border-white/[0.06]">
                Region: &ldquo;{appliedRegion}&rdquo;
                <button type="button" onClick={() => handleRemoveChip('region')} className="text-gray-500 hover:text-gray-300">
                  &times;
                </button>
              </span>
            )}
            {appliedTag && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] text-xs text-gray-300 border border-white/[0.06]">
                Tag: &ldquo;{appliedTag}&rdquo;
                <button type="button" onClick={() => handleRemoveChip('tag')} className="text-gray-500 hover:text-gray-300">
                  &times;
                </button>
              </span>
            )}
            {appliedStatus && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] text-xs text-gray-300 border border-white/[0.06]">
                Status: {STATUS_LABELS[appliedStatus]}
                <button type="button" onClick={() => handleRemoveChip('status')} className="text-gray-500 hover:text-gray-300">
                  &times;
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Table view */}
      <div className="bg-gray-900 border border-white/[0.06] rounded-2xl shadow-xl overflow-hidden">
        {isLoading ? (
          // Loading Skeleton
          <div className="p-8 space-y-4">
            <div className="h-8 bg-white/[0.03] rounded-lg animate-pulse w-1/4" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-white/[0.02] rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ) : isError ? (
          // Error State
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Failed to load contacts</h3>
              <p className="text-gray-500 text-sm mt-1">Please check your network and refresh the page.</p>
            </div>
            <button
              onClick={fetchContacts}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl"
            >
              Retry
            </button>
          </div>
        ) : contactsList.length === 0 ? (
          // Empty State
          <div className="p-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto text-gray-500">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">No contacts found</h3>
              <p className="text-gray-500 text-sm mt-1">
                {hasActiveFilters
                  ? 'No contacts match your active filters. Try broadening your criteria.'
                  : 'Start by uploading your first CSV lead list to get contacts in the database.'}
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 text-sm font-semibold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          // Main Table Rendering
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.01] text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Phone Number</th>
                    <th className="px-6 py-4">Region</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Tags</th>
                    <th className="px-6 py-4">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {contactsList.map((contact) => (
                    <tr key={contact.id} className="hover:bg-white/[0.01] transition-all text-sm text-gray-300">
                      <td className="px-6 py-4 font-semibold text-white">{contact.full_name}</td>
                      <td className="px-6 py-4 font-mono">{contact.phone_number}</td>
                      <td className="px-6 py-4 text-gray-400">{contact.region || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[contact.status]}`}>
                          {STATUS_LABELS[contact.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.length > 0 ? (
                            contact.tags.map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[10px] text-gray-400 font-medium">
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {new Date(contact.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {meta && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-t border-white/[0.06] bg-white/[0.01]">
                <div className="text-xs text-gray-500">
                  Showing {(meta.page - 1) * meta.per_page + 1} – {Math.min(meta.page * meta.per_page, meta.total)} of{' '}
                  <span className="font-bold text-gray-400">{meta.total}</span> contacts
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Per page:</span>
                    <select
                      value={perPage}
                      onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      className="bg-gray-950 border border-white/[0.08] text-gray-300 rounded px-1 py-0.5 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      id="btn-prev-page"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-white/[0.02] border border-white/[0.06] rounded-lg disabled:opacity-30 disabled:pointer-events-none hover:bg-white/[0.04] transition-all"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-500 self-center">
                      Page {meta.page} of {meta.total_pages}
                    </span>
                    <button
                      id="btn-next-page"
                      onClick={() => setCurrentPage((p) => Math.min(meta.total_pages, p + 1))}
                      disabled={currentPage === meta.total_pages || meta.total_pages === 0}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-white/[0.02] border border-white/[0.06] rounded-lg disabled:opacity-30 disabled:pointer-events-none hover:bg-white/[0.04] transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save Dataset Dialog/Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/[0.08] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-bold text-white">Save view as dataset</h3>
              <p className="text-gray-400 text-sm mt-1">
                This will take an immutable snapshot of the current filtered contacts.
              </p>
            </div>

            {/* Current Filters Summary */}
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Matching Filters:</p>
              <div className="text-xs text-gray-300 space-y-1">
                <div>• Total Contacts: <span className="font-bold text-emerald-400">{meta?.total ?? 0}</span></div>
                {appliedSearch && <div>• Search: &ldquo;{appliedSearch}&rdquo;</div>}
                {appliedRegion && <div>• Region: &ldquo;{appliedRegion}&rdquo;</div>}
                {appliedTag && <div>• Tag: &ldquo;{appliedTag}&rdquo;</div>}
                {appliedStatus && <div>• Status: {STATUS_LABELS[appliedStatus]}</div>}
              </div>
            </div>

            {saveDatasetError && (
              <div className="p-3 bg-red-950/40 border border-red-500/20 text-red-400 text-xs rounded-xl">
                {saveDatasetError}
              </div>
            )}

            {saveDatasetSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
                Dataset created successfully!
              </div>
            )}

            <form onSubmit={handleCreateDataset} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400">Dataset Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. California Tech Leads Q2"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-200 bg-white/[0.03] border border-white/[0.08] focus:border-indigo-500 rounded-xl focus:outline-none transition-all placeholder-gray-600"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  id="btn-cancel-dataset"
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  disabled={isSavingDataset}
                  className="flex-1 py-2 text-sm font-semibold text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-dataset"
                  type="submit"
                  disabled={isSavingDataset || saveDatasetSuccess}
                  className="flex-1 py-2 text-sm font-semibold text-white gradient-brand rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isSavingDataset ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Save Snapshot'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
