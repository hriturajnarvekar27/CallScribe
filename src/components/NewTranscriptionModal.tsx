import React, { useEffect, useRef, useState } from 'react';
import { FileAudio, FileVideo, Trash2, UploadCloud, X } from 'lucide-react';
import { AppSettings, OutputSelections, UploadJobPayload } from '../types';
import {
  ACCEPTED_MEDIA_EXTENSIONS,
  formatFileSize,
  stripFileExtension,
  validateMediaFiles,
} from '../utils/format';

interface NewTranscriptionModalProps {
  open: boolean;
  settings: AppSettings;
  prefilledFiles?: File[];
  onClose: () => void;
  onEnqueueUploads: (payloads: UploadJobPayload[]) => void;
}

const ACCEPTED_EXTENSIONS = ACCEPTED_MEDIA_EXTENSIONS.join(',');

function fileFingerprint(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function NewTranscriptionModal({
  open,
  settings,
  prefilledFiles = [],
  onClose,
  onEnqueueUploads,
}: NewTranscriptionModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState(settings.defaultLanguage);
  const [speakers, setSpeakers] = useState('auto');
  const [outputs, setOutputs] = useState<OutputSelections>(settings.defaultOutputs);
  const [context, setContext] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      submittingRef.current = false;
      return;
    }
    submittingRef.current = false;

    const { valid, rejected } = validateMediaFiles(prefilledFiles);
    const seen = new Set<string>();
    const deduped = valid.filter((f) => {
      const fp = fileFingerprint(f);
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    });

    setFiles(deduped);
    setTitle(deduped.length === 1 ? stripFileExtension(deduped[0].name) : '');
    setLanguage(settings.defaultLanguage);
    setSpeakers('auto');
    setOutputs({ ...settings.defaultOutputs });
    setContext('');
    setFormError(
      rejected.length > 0
        ? rejected.length === 1
          ? rejected[0].reason
          : `${rejected[0].reason} (+${rejected.length - 1} more rejected)`
        : null
    );
  }, [open, prefilledFiles, settings]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (arr.length === 0) return;

    const { valid, rejected } = validateMediaFiles(arr);

    setFiles((prev) => {
      const existing = new Set(prev.map(fileFingerprint));
      const uniqueNew: File[] = [];
      for (const f of valid) {
        const fp = fileFingerprint(f);
        if (!existing.has(fp)) {
          existing.add(fp);
          uniqueNew.push(f);
        }
      }
      const merged = [...prev, ...uniqueNew];
      if (merged.length === 1 && !title.trim()) {
        setTitle(stripFileExtension(merged[0].name));
      }
      return merged;
    });

    if (rejected.length > 0) {
      setFormError(
        rejected.length === 1
          ? rejected[0].reason
          : `${rejected[0].reason} (+${rejected.length - 1} more rejected)`
      );
    } else {
      setFormError(null);
    }
  };

  const removeFileAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const toggleOutput = (key: keyof OutputSelections) => {
    setOutputs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    if (files.length === 0) {
      setFormError('Please choose at least one audio or video recording to upload.');
      return;
    }

    const { valid, rejected } = validateMediaFiles(files);
    if (rejected.length > 0 || valid.length === 0) {
      setFormError(rejected[0]?.reason ?? 'Please select valid media files.');
      return;
    }

    submittingRef.current = true;
    const payloads: UploadJobPayload[] = valid.map((f, idx) => ({
      file: f,
      title:
        valid.length === 1
          ? title.trim() || stripFileExtension(f.name)
          : title.trim()
            ? `${title.trim()} (${idx + 1})`
            : stripFileExtension(f.name),
      language,
      speakers,
      outputs,
      context: context.trim(),
    }));

    onEnqueueUploads(payloads);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-transcription-title"
    >
      <div
        className="fixed inset-0 bg-zinc-950/65 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="cs-surface cs-neon-ring relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl cs-scrollbar dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2
              id="new-transcription-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              New transcription
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Drop one or multiple video or audio files to transcribe, analyze, and generate subtitles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Drag and Drop Zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
              className="sr-only"
              id="callscribe-file-upload"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Upload audio or video recordings"
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-400 dark:bg-indigo-950/30'
                  : 'border-zinc-200 bg-zinc-50/60 hover:border-indigo-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-indigo-500'
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400">
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Drop recordings here, or{' '}
                <span className="cs-accent-text text-indigo-600 underline decoration-indigo-300 underline-offset-2 dark:text-indigo-400">
                  browse files
                </span>
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Batch supported · MP4, MOV, MKV, WebM, MP3, M4A, WAV
              </p>
            </div>

            {files.length > 0 && (
              <ul className="mt-3 max-h-36 space-y-1.5 overflow-y-auto cs-scrollbar">
                {files.map((f, idx) => {
                  const isVideo = /\.(mp4|mov|mkv|webm)$/i.test(f.name);
                  return (
                    <li
                      key={`${f.name}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {isVideo ? (
                          <FileVideo className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
                        ) : (
                          <FileAudio className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
                        )}
                        <span className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                          {f.name}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-zinc-400 shrink-0">
                          {formatFileSize(f.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFileAt(idx)}
                        aria-label={`Remove ${f.name}`}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <label
              htmlFor="job-title-input"
              className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              {files.length > 1 ? 'Batch title prefix (optional)' : 'Call title'}
            </label>
            <input
              id="job-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                files.length > 1
                  ? 'Leave blank to use each filename'
                  : 'e.g. Q4 Product Kickoff — Meridian Logistics'
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="job-language-select"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Spoken language
              </label>
              <select
                id="job-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="mr">Marathi (मराठी)</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="job-speakers-select"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Number of speakers
              </label>
              <select
                id="job-speakers-select"
                value={speakers}
                onChange={(e) => setSpeakers(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="auto">Auto-detect</option>
                <option value="2">2 speakers</option>
                <option value="3">3 speakers</option>
                <option value="4+">4+ speakers</option>
              </select>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Outputs to generate
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { key: 'summary', label: 'Summary' },
                  { key: 'notes', label: 'Notes' },
                  { key: 'analysis', label: 'Analysis' },
                  { key: 'subtitles', label: 'Subtitles (.srt)' },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                >
                  <input
                    type="checkbox"
                    checked={outputs[item.key]}
                    onChange={() => toggleOutput(item.key)}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span className="truncate">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="job-context-input"
              className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Add context <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="job-context-input"
              rows={2}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Client name, project background, speaker roles, or domain glossary terms..."
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={files.length === 0}
              className="cs-accent-btn inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              <span>
                {files.length > 1
                  ? `Upload ${files.length} files`
                  : 'Start transcription'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
