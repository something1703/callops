'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

interface Batch {
  id: string;
  original_filename: string;
  row_count: number | null;
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'presigning' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [polledBatch, setPolledBatch] = useState<Batch | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll batch status when upload is in "processing" state
  useEffect(() => {
    if (uploadState !== 'processing' || !batchId) return;

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    const token = getToken();

    async function checkBatchStatus() {
      try {
        const res = await fetch(`http://100.59.0.187:4000/api/uploads/batches`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error('Failed to fetch batches');
        const data = await res.json();
        const batches: Batch[] = data.batches || [];
        const currentBatch = batches.find((b) => b.id === batchId);

        if (currentBatch) {
          setPolledBatch(currentBatch);
          if (currentBatch.status === 'completed') {
            setUploadState('success');
            if (pollingInterval) clearInterval(pollingInterval);
          } else if (currentBatch.status === 'failed') {
            setUploadState('error');
            setErrorMessage('Ingestion failed during ETL cleanup. Check the files or contact system admin.');
            if (pollingInterval) clearInterval(pollingInterval);
          }
        }
      } catch (err) {
        console.error('Error polling batch status:', err);
      }
    }

    // Initial check
    checkBatchStatus();

    // Check every 2 seconds
    pollingInterval = setInterval(checkBatchStatus, 2000);

    return () => { if (pollingInterval) clearInterval(pollingInterval); };
  }, [uploadState, batchId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      setFile(droppedFile);
      setErrorMessage('');
    } else {
      setErrorMessage('Please select a valid .csv file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setErrorMessage('');
      } else {
        setErrorMessage('Please select a valid .csv file.');
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploadState('presigning');
    setProgress(0);
    setErrorMessage('');
    setBatchId(null);
    setPolledBatch(null);

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      // Step 1: Request presigned URL from backend
      const presignRes = await fetch('http://100.59.0.187:4000/api/uploads/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || 'text/csv',
        }),
      });

      if (!presignRes.ok) {
        const errData = await presignRes.json();
        throw new Error(errData.message || 'Failed to request presigned upload URL.');
      }

      const { batch_id, presigned_url } = await presignRes.json();
      setBatchId(batch_id);

      // Step 2: Upload file directly to S3 with progress tracking
      setUploadState('uploading');

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presigned_url, true);
      xhr.setRequestHeader('Content-Type', file.type || 'text/csv');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          setUploadState('processing');
        } else {
          setUploadState('error');
          setErrorMessage(`Direct upload failed with status ${xhr.status}.`);
        }
      };

      xhr.onerror = () => {
        setUploadState('error');
        setErrorMessage('Network error during S3 upload.');
      };

      xhr.send(file);

    } catch (err: unknown) {
      setUploadState('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const resetUpload = () => {
    setFile(null);
    setUploadState('idle');
    setProgress(0);
    setErrorMessage('');
    setBatchId(null);
    setPolledBatch(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Upload Contacts</h1>
          <p className="text-gray-400 mt-2">
            Import new lead lists directly into your secure S3 Data Lake.
          </p>
        </div>
        <Link
          href="/dashboard/contacts"
          className="px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-all"
        >
          Back to Database
        </Link>
      </div>

      {/* Main Upload Box */}
      <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-8 shadow-xl">
        {uploadState === 'idle' && (
          <div className="space-y-6">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className={`
                border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-200
                ${isDragOver
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-white/[0.1] hover:border-white/[0.2] bg-white/[0.02] hover:bg-white/[0.04]'
                }
              `}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv"
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 flex items-center justify-center mb-4 text-indigo-400">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="text-lg font-bold text-white">
                {file ? file.name : 'Select or drop a CSV file'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Only .csv format is accepted (max 20MB)'}
              </p>
            </div>

            {errorMessage && (
              <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-xl text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            {file && (
              <button
                id="btn-upload-file"
                onClick={handleUpload}
                className="w-full py-4 text-sm font-bold text-white gradient-brand rounded-xl hover:brightness-110 active:brightness-95 shadow-md shadow-indigo-600/20 transition-all"
              >
                Upload & Process File
              </button>
            )}
          </div>
        )}

        {/* Uploading / Ingestion Progress Screen */}
        {(uploadState === 'presigning' || uploadState === 'uploading' || uploadState === 'processing') && (
          <div className="flex flex-col items-center justify-center py-10 space-y-6">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full border-4 border-white/[0.04]"></div>
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-indigo-600 transition-all duration-300"
                  strokeDasharray={276}
                  strokeDashoffset={276 - (276 * progress) / 100}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-extrabold text-white text-xl">
                {uploadState === 'processing' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-indigo-400">
                    <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                ) : (
                  `${progress}%`
                )}
              </div>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-white">
                {uploadState === 'presigning' && 'Initializing S3 Link...'}
                {uploadState === 'uploading' && 'Uploading directly to S3...'}
                {uploadState === 'processing' && 'ETL Pipeline Cleaning Data...'}
              </h3>
              <p className="text-gray-400 text-sm max-w-md">
                {uploadState === 'presigning' && 'Requesting authorized signature...'}
                {uploadState === 'uploading' && 'Streaming file packets directly. Progress tracks upload speed.'}
                {uploadState === 'processing' && 'Python ETL Lambda parsing CSV, normalizing phone numbers, and deduping rows in database.'}
              </p>
            </div>
          </div>
        )}

        {/* Success Screen */}
        {uploadState === 'success' && (
          <div className="flex flex-col items-center justify-center py-6 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-extrabold text-white">Ingestion Completed!</h3>
              <p className="text-gray-400 text-sm max-w-md">
                CSV successfully cleaned, deduped on phone numbers, and contacts saved in operational database.
              </p>
            </div>

            {/* Batch Info Card */}
            {polledBatch && (
              <div className="w-full max-w-md bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-3 text-left">
                <div className="flex justify-between border-b border-white/[0.04] pb-2">
                  <span className="text-xs text-gray-500">Filename</span>
                  <span className="text-xs font-bold text-gray-300 truncate max-w-[200px]">{polledBatch.original_filename}</span>
                </div>
                <div className="flex justify-between border-b border-white/[0.04] pb-2">
                  <span className="text-xs text-gray-500">Contacts Ingested</span>
                  <span className="text-xs font-bold text-emerald-400">{polledBatch.row_count ?? 0}</span>
                </div>
                <div className="flex justify-between border-b border-white/[0.04] pb-2">
                  <span className="text-xs text-gray-500">Batch ID</span>
                  <span className="text-xs font-mono text-gray-400">{polledBatch.id}</span>
                </div>
              </div>
            )}

            <div className="flex gap-4 w-full max-w-md pt-4">
              <button
                id="btn-upload-more"
                onClick={resetUpload}
                className="flex-1 py-3 text-sm font-semibold text-gray-300 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-all"
              >
                Upload Another
              </button>
              <Link
                href="/dashboard/contacts"
                className="flex-1 py-3 text-sm font-semibold text-center text-white gradient-brand rounded-xl hover:brightness-110 shadow-md shadow-indigo-600/20 transition-all"
              >
                View Database
              </Link>
            </div>
          </div>
        )}

        {/* Error Screen */}
        {uploadState === 'error' && (
          <div className="flex flex-col items-center justify-center py-6 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-extrabold text-white">Ingestion Failed</h3>
              <p className="text-red-400 text-sm max-w-md">{errorMessage}</p>
            </div>
            <button
              id="btn-try-again"
              onClick={resetUpload}
              className="px-6 py-3 text-sm font-semibold text-white gradient-brand rounded-xl hover:brightness-110 shadow-md shadow-indigo-600/20 transition-all"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
