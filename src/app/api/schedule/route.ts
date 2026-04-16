import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SCHEDULE_FILE = path.join(process.cwd(), 'sessions', 'scheduled-posts.json');

function readSchedule(): Record<string, unknown>[] {
  if (!fs.existsSync(SCHEDULE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8')); } catch { return []; }
}

function writeSchedule(posts: Record<string, unknown>[]) {
  if (!fs.existsSync(path.dirname(SCHEDULE_FILE))) {
    fs.mkdirSync(path.dirname(SCHEDULE_FILE), { recursive: true });
  }
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(posts, null, 2));
}

// GET — list scheduled posts
export async function GET() {
  return NextResponse.json({ posts: readSchedule() });
}

// POST — add scheduled post
export async function POST(req: NextRequest) {
  const body = await req.json();
  const posts = readSchedule();
  const newPost = {
    id: Date.now().toString(),
    ...body,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  posts.push(newPost);
  writeSchedule(posts);
  return NextResponse.json({ success: true, post: newPost });
}

// DELETE — remove scheduled post
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const posts = readSchedule().filter((p) => p.id !== id);
  writeSchedule(posts);
  return NextResponse.json({ success: true });
}
