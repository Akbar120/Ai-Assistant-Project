'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from '@/components/ToastProvider';

interface DiscordChannel {
  id: string;
  name: string;
  guildId: string;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
}

interface PostResult {
  success: boolean;
  results: Record<string, { success: boolean; error?: string }>;
}

export default function DashboardPage() {
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [platforms, setPlatforms] = useState({ discord: false, twitter: false, instagram: false });
  const [dragging, setDragging] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<PostResult | null>(null);
  const [activeTab, setActiveTab] = useState<'compose' | 'preview' | 'notifications'>('compose');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');

  // Discord state
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState('');
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Notifications state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [igContacts, setIgContacts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [discordContacts, setDiscordContacts] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Discord guilds when Discord is selected
  useEffect(() => {
    if (platforms.discord && guilds.length === 0) {
      fetch('/api/discord/guilds')
        .then((r) => r.json())
        .then((d) => { if (d.guilds) setGuilds(d.guilds); })
        .catch(() => null);
    }
  }, [platforms.discord, guilds.length]);

  // Load channels when guild is selected
  useEffect(() => {
    if (!selectedGuild) return;
    setLoadingChannels(true);
    fetch(`/api/discord/guilds?guildId=${selectedGuild}`)
      .then((r) => r.json())
      .then((d) => { if (d.channels) setChannels(d.channels); })
      .catch(() => null)
      .finally(() => setLoadingChannels(false));
  }, [selectedGuild]);

  const fetchNotifications = async () => {
    if (loadingNotifications) return;
    setLoadingNotifications(true);
    try {
      const [igRes, discordRes] = await Promise.all([
        fetch('/api/instagram/dms').then(r => r.json()).catch(() => ({ contacts: [] })),
        fetch('/api/discord/dms').then(r => r.json()).catch(() => ({ contacts: [] }))
      ]);
      setIgContacts((igRes.contacts || []).filter((c: any) => c.isUnread));
      setDiscordContacts((discordRes.contacts || []).filter((c: any) => c.isUnread));
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications();
    }
  }, [activeTab]);

  const togglePlatform = (p: keyof typeof platforms) => {
    setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));
  };

  const handleFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles].slice(0, 4));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    handleFiles(dropped);
  }, []);

  const charLimit = { discord: 2000, twitter: 280, instagram: 2200 };
  const activePlatforms = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k);
  const tightest = activePlatforms.includes('twitter') ? charLimit.twitter :
    activePlatforms.includes('discord') ? charLimit.discord : charLimit.instagram;

  const handlePost = async () => {
    if (!caption.trim()) { toast('Please enter a caption', 'error'); return; }
    if (activePlatforms.length === 0) { toast('Select at least one platform', 'error'); return; }
    if (platforms.discord && selectedChannels.length === 0) { toast('Select Discord channels', 'error'); return; }

    setPosting(true);
    setPostResult(null);

    try {
      if (scheduleMode && scheduleTime) {
        // Schedule the post
        const body = {
          caption,
          platforms: activePlatforms,
          scheduled_at: new Date(scheduleTime).toISOString(),
          discord_config: platforms.discord ? { channels: selectedChannels } : null,
        };
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          toast('Post scheduled successfully! 🕐', 'success');
          resetForm();
        } else {
          toast('Failed to schedule post', 'error');
        }
      } else {
        // Post now
        const fd = new FormData();
        fd.append('caption', caption);
        fd.append('platforms', JSON.stringify(activePlatforms));
        fd.append('discordConfig', JSON.stringify(platforms.discord ? { channels: selectedChannels } : null));
        files.forEach((f, i) => fd.append(`file_${i}`, f));

        const res = await fetch('/api/post', { method: 'POST', body: fd });
        const data: PostResult = await res.json();
        setPostResult(data);

        if (data.success) {
          toast('Posted successfully! 🎉', 'success');
          resetForm();
        } else {
          toast('Some posts failed — check results', 'error');
        }
      }
    } catch (err) {
      toast('Network error — please try again', 'error');
    } finally {
      setPosting(false);
    }
  };

  const resetForm = () => {
    setCaption('');
    setFiles([]);
    setPlatforms({ discord: false, twitter: false, instagram: false });
    setSelectedChannels([]);
    setScheduleMode(false);
    setScheduleTime('');
  };

  const charCount = caption.length;
  const charClass = charCount > tightest ? 'over' : charCount > tightest * 0.9 ? 'warn' : '';

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">⚡ Create Post</div>
        <div className="topbar-actions">
          <div className="tabs" style={{ width: '340px' }}>
            <button className={`tab ${activeTab === 'compose' ? 'active' : ''}`} onClick={() => setActiveTab('compose')}>
              ✏️ Compose
            </button>
            <button className={`tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>
              👁 Preview
            </button>
            <button className={`tab ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
              🔔 Notifications
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {activeTab === 'compose' ? (
          <div className="composer-layout">
            {/* Left: Caption + Media */}
            <div className="composer-left">
              {/* Caption */}
              <div className="card animate-in">
                <div className="card-header">
                  <div>
                    <div className="card-title">📝 Caption</div>
                    <div className="card-subtitle">Write your post content</div>
                  </div>
                </div>
                <textarea
                  className="input"
                  placeholder="What's on your mind? Let the AI agent help you craft the perfect caption..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  style={{ fontSize: '15px', lineHeight: '1.7' }}
                />
                <div className={`char-counter ${charClass}`}>
                  {charCount} / {tightest > 0 ? tightest : '∞'} chars
                  {activePlatforms.length === 0 && ' (select a platform)'}
                </div>

                {/* Quick AI buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <span className="chat-pill" onClick={() => window.location.href = '/chat'}>
                    🌸 Generate with Jenny ✨
                  </span>
                  <span className="chat-pill" onClick={() => setCaption((c) => c + ' #trending #viral #socialmedia')}>
                    # Add Hashtags
                  </span>
                  <span className="chat-pill" onClick={() => setCaption((c) => c + ' 🔥✨💯')}>
                    😊 Add Emoji
                  </span>
                </div>
              </div>

              {/* Media Upload */}
              <div className="card animate-in stagger-1">
                <div className="card-header">
                  <div className="card-title">🖼️ Media</div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{files.length}/4</span>
                </div>

                <div
                  className={`upload-zone ${dragging ? 'dragging' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-icon">{dragging ? '📂' : '🎨'}</div>
                  <div className="upload-text">
                    {dragging ? 'Drop files here' : 'Drag & drop or click to upload'}
                  </div>
                  <div className="upload-hint">Images, Videos (max 4 files, 50MB each)</div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleFiles(Array.from(e.target.files || []))}
                />

                {files.length > 0 && (
                  <div className="upload-preview">
                    {files.map((file, i) => (
                      <div key={i} className="upload-preview-item">
                        {file.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(file)} alt={file.name} />
                        ) : (
                          <video src={URL.createObjectURL(file)} />
                        )}
                        <button
                          className="upload-preview-remove"
                          onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, j) => j !== i)); }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Platforms + Post */}
            <div className="composer-right">
              {/* Platform Selection */}
              <div className="card animate-in stagger-2">
                <div className="card-header">
                  <div className="card-title">🎯 Platforms</div>
                </div>

                <PlatformCheck
                  id="discord"
                  emoji="💬"
                  name="Discord"
                  color="var(--discord)"
                  checked={platforms.discord}
                  onChange={() => togglePlatform('discord')}
                />
                {platforms.discord && (
                  <div style={{ marginLeft: '28px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {guilds.length === 0 ? (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        No servers found.{' '}
                        <a href="/accounts" style={{ color: 'var(--accent-light)' }}>Configure Discord →</a>
                      </div>
                    ) : (
                      <>
                        <select
                          className="select"
                          value={selectedGuild}
                          onChange={(e) => { setSelectedGuild(e.target.value); setSelectedChannels([]); }}
                        >
                          <option value="">Select server…</option>
                          {guilds.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                        {selectedGuild && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                            {loadingChannels ? (
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading channels…</span>
                            ) : channels.map((ch) => (
                              <label key={ch.id} className="checkbox-wrap" style={{ padding: '6px 8px' }}>
                                <div className={`checkbox ${selectedChannels.includes(ch.id) ? 'checked' : ''}`} />
                                <span style={{ fontSize: '13px' }}>#{ch.name}</span>
                                <input
                                  type="checkbox"
                                  checked={selectedChannels.includes(ch.id)}
                                  onChange={() => setSelectedChannels((prev) =>
                                    prev.includes(ch.id) ? prev.filter((id) => id !== ch.id) : [...prev, ch.id]
                                  )}
                                  style={{ display: 'none' }}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div style={{ height: '8px' }} />
                <PlatformCheck
                  id="twitter"
                  emoji="🐦"
                  name="X / Twitter"
                  color="var(--twitter)"
                  checked={platforms.twitter}
                  onChange={() => togglePlatform('twitter')}
                  note={caption.length > 280 ? '⚠️ Caption exceeds 280 chars' : undefined}
                />
                <div style={{ height: '8px' }} />
                <PlatformCheck
                  id="instagram"
                  emoji="📸"
                  name="Instagram"
                  color="var(--instagram)"
                  checked={platforms.instagram}
                  onChange={() => togglePlatform('instagram')}
                  note={files.length === 0 && platforms.instagram ? '⚠️ Requires media' : undefined}
                />
              </div>

              {/* Schedule toggle */}
              <div className="card animate-in stagger-2">
                <div className="card-header">
                  <div className="card-title">⏱ Timing</div>
                  <label className="toggle-wrap">
                    <div className={`toggle ${scheduleMode ? 'on' : ''}`} onClick={() => setScheduleMode(!scheduleMode)}>
                      <div className="toggle-thumb" />
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Schedule</span>
                  </label>
                </div>

                {scheduleMode ? (
                  <div className="input-group">
                    <label className="input-label">Post at</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Posts will be published immediately
                  </div>
                )}
              </div>

              {/* Post Button */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  className={`btn ${scheduleMode ? 'btn-secondary' : 'btn-primary'} btn-lg`}
                  onClick={handlePost}
                  disabled={posting}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {posting ? (
                    <><span className="spinner" /> Posting…</>
                  ) : scheduleMode ? (
                    '🕐 Schedule Post'
                  ) : (
                    '🚀 Post Now'
                  )}
                </button>

                <button className="btn btn-ghost" onClick={resetForm} style={{ width: '100%' }}>
                  🗑 Clear All
                </button>
              </div>

              {/* Results */}
              {postResult && (
                <div className="card animate-in">
                  <div className="card-title" style={{ marginBottom: '12px' }}>
                    {postResult.success ? '✅ Results' : '⚠️ Partial Results'}
                  </div>
                  {Object.entries(postResult.results).map(([platform, res]) => (
                    <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ textTransform: 'capitalize', flex: 1, fontSize: '14px' }}>
                        {platform === 'discord' ? '💬' : platform === 'twitter' ? '🐦' : '📸'} {platform}
                      </span>
                      {res.success ? (
                        <span className="badge badge-success">✓ Posted</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span className="badge badge-error">✗ Failed</span>
                          <span style={{ fontSize: '11px', color: 'var(--error)', maxWidth: '250px', textAlign: 'right' }}>
                            {res.error}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'preview' ? (
          // Preview Tab
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px', margin: '0 auto' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Preview how your post will look on each platform
            </div>

            {(caption || files.length > 0) ? (
              <>
                {platforms.discord && (
                  <PreviewCard platform="Discord" emoji="💬" color="var(--discord)">
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--discord)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🤖</div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: '4px', color: '#4e9bff' }}>Jenny <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                        <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{caption || 'Your caption here…'}</div>
                        {files[0]?.type.startsWith('image/') && (
                          <img src={URL.createObjectURL(files[0])} alt="" style={{ marginTop: '8px', maxWidth: '100%', borderRadius: '8px', maxHeight: '300px', objectFit: 'cover' }} />
                        )}
                      </div>
                    </div>
                  </PreviewCard>
                )}

                {platforms.twitter && (
                  <PreviewCard platform="X / Twitter" emoji="🐦" color="var(--twitter)">
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>👤</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>Your Name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>@yourhandle · now</span></div>
                        <div style={{ fontSize: '15px', whiteSpace: 'pre-wrap' }}>{caption.slice(0, 280) || 'Your tweet here…'}</div>
                        {caption.length > 280 && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>⚠️ Truncated to 280 characters</div>}
                        {files[0]?.type.startsWith('image/') && (
                          <img src={URL.createObjectURL(files[0])} alt="" style={{ marginTop: '10px', width: '100%', borderRadius: '12px', maxHeight: '280px', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                        )}
                        <div style={{ marginTop: '12px', display: 'flex', gap: '28px', color: 'var(--text-muted)', fontSize: '13px' }}>
                          <span>💬 0</span><span>🔁 0</span><span>❤️ 0</span><span>📊 0</span>
                        </div>
                      </div>
                    </div>
                  </PreviewCard>
                )}

                {platforms.instagram && (
                  <PreviewCard platform="Instagram" emoji="📸" color="var(--instagram)">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--instagram-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📸</div>
                        <span style={{ fontWeight: 600 }}>youraccount</span>
                      </div>
                      {files[0]?.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(files[0])} alt="" style={{ width: '100%', borderRadius: '8px', maxHeight: '340px', objectFit: 'cover', marginBottom: '12px' }} />
                      ) : (
                        <div style={{ background: '#111', borderRadius: '8px', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', marginBottom: '12px' }}>📸</div>
                      )}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', fontSize: '20px' }}>❤️ 💬 📤 🔖</div>
                      <div style={{ fontSize: '14px' }}><span style={{ fontWeight: 600 }}>youraccount </span>{caption || 'Your caption here…'}</div>
                    </div>
                  </PreviewCard>
                )}

                {activePlatforms.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon">👈</div>
                    <div className="empty-state-title">Select platforms to preview</div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">✍️</div>
                <div className="empty-state-title">Nothing to preview yet</div>
                <div className="empty-state-desc">Write a caption or upload media to see a preview</div>
              </div>
            )}
          </div>
        ) : (
          // Notifications Tab
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px', margin: '0 auto' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div style={{ fontSize: '15px', color: 'var(--text-muted)' }}>Recent Direct Messages & Requests</div>
               <button className="btn btn-secondary btn-sm" onClick={fetchNotifications} disabled={loadingNotifications}>
                 {loadingNotifications ? <><span className="spinner" style={{ width: '14px', height: '14px' }}/> Fetching…</> : '🔄 Refresh'}
               </button>
             </div>
             
             {loadingNotifications && igContacts.length === 0 && discordContacts.length === 0 ? (
               <div className="empty-state">
                 <div className="spinner" />
                 <div className="empty-state-title" style={{ marginTop: '16px' }}>Scraping recent DMs...</div>
                 <div className="empty-state-desc">This may take around 15 seconds as it launches invisible browsers to fetch new messages.</div>
               </div>
             ) : (
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                 {/* Instagram Column */}
                 <div className="card">
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
                     <span style={{ fontSize: '18px' }}>📸</span>
                     <span style={{ fontWeight: 600, color: 'var(--instagram)' }}>Instagram DMs</span>
                   </div>
                   {igContacts.length === 0 ? (
                     <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>No new messages.</div>
                   ) : (
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                       {igContacts.map((c, i) => (
                         <a href={c.threadUrl || 'https://www.instagram.com/direct/inbox/'} target="_blank" rel="noopener noreferrer" key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', background: 'var(--bg-elevated)', borderRadius: '8px', cursor: 'pointer', textDecoration: 'none', color: 'inherit' }} onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'} onMouseOut={(e) => e.currentTarget.style.filter = 'none'}>
                           {c.avatarUrl ? (
                             <img src={c.avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                           ) : (
                             <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                           )}
                           <div style={{ flex: 1, minWidth: 0 }}>
                             <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.displayName || c.username}</div>
                             <div style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage || 'Sent a message'}</div>
                           </div>
                         </a>
                       ))}
                     </div>
                   )}
                 </div>

                 {/* Discord Column */}
                 <div className="card">
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
                     <span style={{ fontSize: '18px' }}>💬</span>
                     <span style={{ fontWeight: 600, color: 'var(--discord)' }}>Discord DMs</span>
                   </div>
                   {discordContacts.length === 0 ? (
                     <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>No new messages.</div>
                   ) : (
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                       {discordContacts.map((c, i) => (
                         <a href={c.threadUrl || 'https://discord.com/channels/@me'} target="_blank" rel="noopener noreferrer" key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', background: 'var(--bg-elevated)', borderRadius: '8px', cursor: 'pointer', textDecoration: 'none', color: 'inherit' }} onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'} onMouseOut={(e) => e.currentTarget.style.filter = 'none'}>
                           {c.avatarUrl ? (
                             <img src={c.avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                           ) : (
                             <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                           )}
                           <div style={{ flex: 1, minWidth: 0 }}>
                             <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.displayName || c.username}</div>
                             <div style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage}</div>
                           </div>
                         </a>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
             )}
          </div>
        )}
      </div>
    </>
  );
}

function PlatformCheck({ id, emoji, name, color, checked, onChange, note }: {
  id: string; emoji: string; name: string; color: string;
  checked: boolean; onChange: () => void; note?: string;
}) {
  return (
    <div>
      <label className="checkbox-wrap" htmlFor={id}>
        <div className={`checkbox ${checked ? 'checked' : ''}`} onClick={onChange} />
        <span style={{ fontSize: '15px' }}>{emoji}</span>
        <span style={{ fontWeight: 500, color: checked ? color : 'var(--text-primary)' }}>{name}</span>
        <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
      </label>
      {note && <div style={{ fontSize: '12px', color: 'var(--warning)', marginLeft: '48px', marginTop: '2px' }}>{note}</div>}
    </div>
  );
}

function PreviewCard({ platform, emoji, color, children }: { platform: string; emoji: string; color: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: '16px' }}>{emoji}</span>
        <span style={{ fontWeight: 600, color }}>{platform}</span>
        <span className="badge badge-accent" style={{ marginLeft: 'auto', fontSize: '10px' }}>Preview</span>
      </div>
      {children}
    </div>
  );
}
