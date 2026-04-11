'use client';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ToastProvider';

interface ScheduledPost {
  id: string;
  caption: string;
  platforms: string[];
  scheduled_at: string;
  status: 'pending' | 'posted' | 'failed' | 'processing' | 'partial';
  created_at: string;
}

const STATUS_STYLES: Record<ScheduledPost['status'], string> = {
  pending: 'badge-accent',
  posted: 'badge-success',
  failed: 'badge-error',
  processing: 'badge-warning',
  partial: 'badge-warning',
};

const STATUS_LABELS: Record<ScheduledPost['status'], string> = {
  pending: '🕐 Pending',
  posted: '✅ Posted',
  failed: '❌ Failed',
  processing: '⏳ Processing',
  partial: '⚠️ Partial',
};

const PLATFORM_EMOJI: Record<string, string> = {
  discord: '💬',
  twitter: '🐦',
  instagram: '📸',
};

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    setLoading(true);
    const res = await fetch('/api/schedule').then((r) => r.json());
    setPosts(res.posts || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
    const interval = setInterval(fetchPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  const deletePost = async (id: string) => {
    await fetch('/api/schedule', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setPosts((prev) => prev.filter((p) => p.id !== id));
    toast('Scheduled post removed', 'info');
  };

  const pending = posts.filter((p) => p.status === 'pending');
  const done = posts.filter((p) => p.status !== 'pending');

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">🕐 Scheduled Posts</div>
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={fetchPosts}>🔄 Refresh</button>
          <a href="/dashboard" className="btn btn-primary btn-sm">+ New Post</a>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">No scheduled posts</div>
            <div className="empty-state-desc">
              Posts you schedule from the Dashboard or AI Chat will appear here.
            </div>
            <a href="/dashboard" className="btn btn-primary">
              ✏️ Create a Post
            </a>
          </div>
        ) : (
          <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {pending.length > 0 && (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🕐 Upcoming <span className="badge badge-accent">{pending.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {pending.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()).map((post) => (
                    <PostCard key={post.id} post={post} onDelete={deletePost} />
                  ))}
                </div>
              </div>
            )}

            {done.length > 0 && (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  📋 History
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {done.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()).map((post) => (
                    <PostCard key={post.id} post={post} onDelete={deletePost} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function PostCard({ post, onDelete }: { post: ScheduledPost; onDelete: (id: string) => void }) {
  const scheduledDate = new Date(post.scheduled_at);
  const isOverdue = scheduledDate < new Date() && post.status === 'pending';
  const diff = scheduledDate.getTime() - Date.now();
  const hoursUntil = Math.round(diff / (1000 * 60 * 60));
  const minutesUntil = Math.round(diff / (1000 * 60));

  const timeLabel = diff > 0
    ? hoursUntil > 24
      ? scheduledDate.toLocaleString()
      : hoursUntil >= 1
        ? `in ${hoursUntil}h ${Math.round((diff - hoursUntil * 3600000) / 60000)}m`
        : `in ${minutesUntil}m`
    : scheduledDate.toLocaleString();

  return (
    <div className="card" style={{ border: isOverdue ? '1px solid var(--warning)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{ flex: 1 }}>
          {/* Caption */}
          <div style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {post.caption}
          </div>

          {/* Platform badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            {post.platforms.map((p) => (
              <span key={p} className="badge badge-accent" style={{ fontSize: '11px' }}>
                {PLATFORM_EMOJI[p] || '🌐'} {p}
              </span>
            ))}
          </div>

          {/* Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <span title={scheduledDate.toLocaleString()}>
              📅 {isOverdue ? '⚠️ Overdue · ' : ''}{timeLabel}
            </span>
            <span className={`badge ${STATUS_STYLES[post.status]}`} style={{ fontSize: '11px' }}>
              {STATUS_LABELS[post.status]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {post.status === 'pending' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onDelete(post.id)}
              style={{ padding: '6px 8px', color: 'var(--error)', borderColor: 'rgba(239,68,68,0.2)' }}
              title="Cancel post"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
