/**
 * Improvement Request Service
 * ──────────────────────────────────────────────────────────────
 * Provides a controlled approval gate for any agent/orchestrator
 * requests to modify files, skills, modules, or workspace docs.
 *
 * Lifecycle: pending → approved → applied
 *                   ↘ rejected
 */

import * as fs from 'fs';
import * as path from 'path';

export type ImprovementStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface ImprovementRequest {
  id: string;
  created_at: string;
  updated_at: string;
  status: ImprovementStatus;
  requestedBy: string;       // agent name or 'orchestrator'
  title: string;             // short summary (shown in badge/list)
  what: string;              // what change is requested
  files: string[];           // which files/modules will be affected
  why: string;               // reason for the change
  if_approved: string;       // what happens if approved
  if_rejected: string;       // what happens if rejected
  patch?: string;            // optional: the actual content to write on apply
}

const IMPROVEMENTS_DIR = path.join(process.cwd(), 'src', 'data', 'improvements');

function ensureDir() {
  if (!fs.existsSync(IMPROVEMENTS_DIR)) {
    fs.mkdirSync(IMPROVEMENTS_DIR, { recursive: true });
  }
}

function generateId(): string {
  return `impr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function filePath(id: string): string {
  return path.join(IMPROVEMENTS_DIR, `${id}.json`);
}

export function createImprovement(data: Omit<ImprovementRequest, 'id' | 'created_at' | 'updated_at' | 'status'>): ImprovementRequest {
  ensureDir();
  const now = new Date().toISOString();
  const request: ImprovementRequest = {
    id: generateId(),
    created_at: now,
    updated_at: now,
    status: 'pending',
    ...data,
  };
  fs.writeFileSync(filePath(request.id), JSON.stringify(request, null, 2), 'utf-8');
  return request;
}

export function getImprovement(id: string): ImprovementRequest | null {
  try {
    return JSON.parse(fs.readFileSync(filePath(id), 'utf-8'));
  } catch {
    return null;
  }
}

export function listImprovements(status?: ImprovementStatus): ImprovementRequest[] {
  ensureDir();
  try {
    return fs.readdirSync(IMPROVEMENTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(IMPROVEMENTS_DIR, f), 'utf-8')); } catch { return null; }
      })
      .filter(Boolean)
      .filter((r: ImprovementRequest) => !status || r.status === status)
      .sort((a: ImprovementRequest, b: ImprovementRequest) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  } catch {
    return [];
  }
}

export function updateImprovementStatus(id: string, status: ImprovementStatus): ImprovementRequest | null {
  const request = getImprovement(id);
  if (!request) return null;
  request.status = status;
  request.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath(id), JSON.stringify(request, null, 2), 'utf-8');
  return request;
}

/**
 * Apply an approved improvement: write the patch to each file.
 * Only works if status is 'approved'.
 */
export function applyImprovement(id: string): { success: boolean; error?: string } {
  const request = getImprovement(id);
  if (!request) return { success: false, error: 'Not found' };
  if (request.status !== 'approved') return { success: false, error: 'Must be approved first' };
  if (!request.patch) return { success: false, error: 'No patch content provided' };

  try {
    // For single-file patches: write patch to first listed file
    const targetFile = request.files[0];
    if (!targetFile) return { success: false, error: 'No target file specified' };
    const absPath = path.join(process.cwd(), targetFile);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, request.patch, 'utf-8');

    updateImprovementStatus(id, 'applied');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
