'use client';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ToastProvider';

type Step = 0 | 1 | 2 | 3;

interface DiscordStatus {
  configured: boolean;
  botName?: string;
  clientId?: string;
  guilds?: { id: string; name: string; icon: string | null }[];
}

export default function AccountsPage() {
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [twitterConnected, setTwitterConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [discordWebConnected, setDiscordWebConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Discord wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<Step>(0);
  const [botToken, setBotToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardResult, setWizardResult] = useState<{ botName: string; guilds: { id: string; name: string }[]; inviteUrl?: string } | null>(null);

  // Twitter / Instagram
  const [automationLoading, setAutomationLoading] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [discordRes, twitterRes, instaRes, discordWebRes] = await Promise.all([
        fetch('/api/discord/config').then((r) => r.json()),
        fetch('/api/automation/twitter').then((r) => r.json()),
        fetch('/api/automation/instagram').then((r) => r.json()),
        fetch('/api/automation/discord-web').then((r) => r.json()),
      ]);
      setDiscordStatus(discordRes);
      setTwitterConnected(twitterRes.connected);
      setInstagramConnected(instaRes.connected);
      setDiscordWebConnected(discordWebRes.connected);
    } catch (err) {
      toast('Failed to load status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const submitDiscordBot = async () => {
    if (!botToken.trim()) { toast('Please enter your bot token', 'error'); return; }
    setWizardLoading(true);
    try {
      const res = await fetch('/api/discord/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken, clientId }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Invalid token', 'error'); return; }
      setWizardResult(data);
      setWizardStep(3);
      await loadStatus();
      toast(`✅ Discord bot connected as "${data.botName}"!`, 'success');
    } catch {
      toast('Connection failed', 'error');
    } finally {
      setWizardLoading(false);
    }
  };

  const disconnectDiscord = async () => {
    await fetch('/api/discord/config', { method: 'DELETE' });
    setDiscordStatus({ configured: false });
    toast('Discord disconnected', 'info');
  };

  const connectAutomation = async (platform: 'twitter' | 'instagram' | 'discord-web') => {
    setAutomationLoading(platform);
    try {
      const res = await fetch(`/api/automation/${platform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login' }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`✅ ${platform === 'twitter' ? 'X/Twitter' : platform === 'instagram' ? 'Instagram' : 'Discord Personal'} connected!`, 'success');
        await loadStatus();
      } else {
        toast(data.error || 'Login failed', 'error');
      }
    } catch {
      toast('Failed to open browser', 'error');
    } finally {
      setAutomationLoading(null);
    }
  };

  const disconnectAutomation = async (platform: 'twitter' | 'instagram' | 'discord-web') => {
    await fetch(`/api/automation/${platform}`, { method: 'DELETE' });
    if (platform === 'twitter') setTwitterConnected(false);
    else if (platform === 'instagram') setInstagramConnected(false);
    else setDiscordWebConnected(false);
    toast(`${platform === 'twitter' ? 'X/Twitter' : platform === 'instagram' ? 'Instagram' : 'Discord Personal'} disconnected`, 'info');
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">🔗 Connected Accounts</div>
        <button className="btn btn-ghost btn-sm" onClick={loadStatus}>🔄 Refresh</button>
      </div>

      <div className="page-content">
        <div className="section-title">Platform Connections</div>
        <div className="section-desc">Connect your social media accounts to start posting from a single dashboard.</div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '720px' }}>

            {/* ─── Discord ─── */}
            <div className="card animate-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="platform-icon discord" style={{ fontSize: '24px' }}>💬</div>
                <div style={{ flex: 1 }}>
                  <div className="platform-name">Discord</div>
                  <div className="platform-desc">Post to channels via Discord Bot (Free — no API fees)</div>
                </div>
                {discordStatus?.configured ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-success"><span className="status-dot pulse" /> Connected</span>
                    <button className="btn btn-ghost btn-sm" onClick={disconnectDiscord}>Disconnect</button>
                  </div>
                ) : (
                  <button className="btn btn-discord btn-sm" onClick={() => { setShowWizard(true); setWizardStep(0); }}>
                    Connect Discord
                  </button>
                )}
              </div>

              {discordStatus?.configured && (
                <div style={{ marginTop: '16px', padding: '14px', background: 'var(--discord-dim)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(88,101,242,0.2)' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                    🤖 Bot: {discordStatus.botName}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Ready to post to your Discord servers
                  </div>
                </div>
              )}
            </div>

            {/* ─── Discord (Personal Web) ─── */}
            <div className="card animate-in stagger-1">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="platform-icon discord" style={{ fontSize: '24px' }}>👤</div>
                <div style={{ flex: 1 }}>
                  <div className="platform-name">Discord (Personal)</div>
                  <div className="platform-desc">Log in to fetch personal DMs for Notifications</div>
                </div>
                {discordWebConnected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-success"><span className="status-dot pulse" /> Connected</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => disconnectAutomation('discord-web')}>Disconnect</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-discord btn-sm"
                    onClick={() => connectAutomation('discord-web')}
                    disabled={automationLoading === 'discord-web'}
                  >
                    {automationLoading === 'discord-web' ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Opening…</> : 'Connect Personal Discord'}
                  </button>
                )}
              </div>
              {!discordWebConnected && (
                <div className="info-box" style={{ marginTop: '14px' }}>
                  <strong>How it works:</strong> Click "Connect Personal Discord" to open a browser window to discord.com/login.
                  Log in normally — your session cookies are saved locally. <strong>No passwords are stored.</strong>
                </div>
              )}
            </div>

            {/* ─── X / Twitter ─── */}
            <div className="card animate-in stagger-1">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="platform-icon twitter" style={{ fontSize: '22px', background: 'rgba(255,255,255,0.05)' }}>𝕏</div>
                <div style={{ flex: 1 }}>
                  <div className="platform-name">X / Twitter</div>
                  <div className="platform-desc">Post tweets via browser automation — no paid API needed</div>
                </div>
                {twitterConnected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-success"><span className="status-dot pulse" /> Connected</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => disconnectAutomation('twitter')}>Disconnect</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => connectAutomation('twitter')}
                    disabled={automationLoading === 'twitter'}
                  >
                    {automationLoading === 'twitter' ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Opening…</> : 'Connect X'}
                  </button>
                )}
              </div>

              {!twitterConnected && (
                <div className="info-box" style={{ marginTop: '14px' }}>
                  <strong>How it works:</strong> Click "Connect X" to open a browser window to twitter.com/login.
                  Log in normally — your session cookies are saved locally. <strong>No passwords are stored.</strong>
                </div>
              )}
            </div>

            {/* ─── Instagram ─── */}
            <div className="card animate-in stagger-2">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="platform-icon instagram" style={{ fontSize: '22px' }}>📸</div>
                <div style={{ flex: 1 }}>
                  <div className="platform-name">Instagram</div>
                  <div className="platform-desc">Post feed photos, reels, and stories via browser automation</div>
                </div>
                {instagramConnected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-success"><span className="status-dot pulse" /> Connected</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => disconnectAutomation('instagram')}>Disconnect</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => connectAutomation('instagram')}
                    disabled={automationLoading === 'instagram'}
                  >
                    {automationLoading === 'instagram' ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Opening…</> : 'Connect Instagram'}
                  </button>
                )}
              </div>

              {!instagramConnected && (
                <div className="info-box" style={{ marginTop: '14px' }}>
                  <strong>How it works:</strong> Click "Connect Instagram" to open instagram.com/login in a browser.
                  Log in once — session is saved securely. Instagram requires media for posting.
                </div>
              )}
            </div>

            {/* Security note */}
            <div className="card" style={{ border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.03)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--success)' }}>
                🔐 Security & Privacy
              </div>
              <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '16px', lineHeight: '1.8' }}>
                <li>Passwords are <strong>never</strong> stored — only session cookies</li>
                <li>Cookies are stored locally in the <code style={{ background: 'var(--bg-base)', padding: '1px 5px', borderRadius: '4px' }}>sessions/</code> folder</li>
                <li>All automation runs on your device — nothing sent to external servers</li>
                <li>Revoke access anytime by clicking Disconnect</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Discord Setup Wizard Modal */}
      {showWizard && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowWizard(false)}>
          <div className="modal" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <div className="modal-title">💬 Connect Discord Bot</div>
              <button className="modal-close" onClick={() => { setShowWizard(false); setWizardStep(0); }}>×</button>
            </div>

            {/* Progress steps */}
            <div className="wizard-steps">
              {['Create Bot', 'Get Token', 'Add to Server', 'Connected'].map((label, i) => (
                <div key={i} className={`wizard-step ${wizardStep === i ? 'active' : wizardStep > i ? 'done' : ''}`}>
                  <div className="wizard-step-num">{wizardStep > i ? '✓' : i + 1}</div>
                  <span className="wizard-step-label">{label}</span>
                </div>
              ))}
            </div>

            {wizardStep === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>Step 1: Create a Discord Application</div>
                <ol style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '18px', lineHeight: '2' }}>
                  <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener" style={{ color: 'var(--accent-light)' }}>discord.com/developers/applications</a></li>
                  <li>Click <strong>"New Application"</strong> and give it a name</li>
                  <li>In the left sidebar, click <strong>"Bot"</strong></li>
                  <li>Click <strong>"Add Bot"</strong> and confirm</li>
                </ol>
                <div className="info-box">
                  💡 The Discord Developer Portal is free. No credit card or payment required.
                </div>
                <button className="btn btn-primary" onClick={() => setWizardStep(1)}>
                  I've created the app →
                </button>
              </div>
            )}

            {wizardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>Step 2: Get Your Bot Token & Client ID</div>
                <ol style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '18px', lineHeight: '2' }}>
                  <li>In the Bot page, click <strong>"Reset Token"</strong></li>
                  <li>Copy the token and paste it below</li>
                  <li>Also go to <strong>General Information</strong> and copy the <strong>Application ID</strong></li>
                </ol>
                <div className="input-group">
                  <label className="input-label">Bot Token *</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="MTxxxxxxxx.GyyUJx.xxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Application ID (Client ID) — needed for bot invite URL</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="1234567890123456789"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div className="info-box" style={{ color: 'var(--warning)', background: 'var(--warning-dim)', borderColor: 'rgba(245,158,11,0.2)' }}>
                  ⚠️ Keep your bot token secret! Never share it publicly.
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-ghost" onClick={() => setWizardStep(0)}>← Back</button>
                  <button className="btn btn-primary" onClick={() => setWizardStep(2)} disabled={!botToken}>
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>Step 3: Add Bot to Your Server</div>
                <ol style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '18px', lineHeight: '2' }}>
                  <li>Go to <strong>OAuth2 → URL Generator</strong> in the Developer Portal</li>
                  <li>Under scopes, check <strong>bot</strong></li>
                  <li>Under permissions, check <strong>Send Messages</strong> and <strong>Attach Files</strong></li>
                  <li>Copy the generated URL and open it in your browser</li>
                  <li>Select your server and authorize</li>
                </ol>
                {clientId && (
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Or use this pre-built invite link:</div>
                    <div className="code-block">
                      {`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=2048&scope=bot`}
                    </div>
                    <button
                      className="btn btn-discord btn-sm"
                      style={{ marginTop: '8px' }}
                      onClick={() => window.open(`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=2048&scope=bot`, '_blank')}
                    >
                      🔗 Open Invite Link
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button className="btn btn-ghost" onClick={() => setWizardStep(1)}>← Back</button>
                  <button
                    className="btn btn-primary"
                    onClick={submitDiscordBot}
                    disabled={wizardLoading}
                  >
                    {wizardLoading ? <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Connecting…</> : '✓ Connect Bot'}
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && wizardResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--success)' }}>Discord Connected!</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Bot <strong>{wizardResult.botName}</strong> is ready to post.
                </div>
                {wizardResult.guilds && wizardResult.guilds.length > 0 && (
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Accessible Servers:</div>
                    {wizardResult.guilds.map((g) => (
                      <div key={g.id} className="list-item" style={{ marginBottom: '6px' }}>
                        <span>🏠</span>
                        <span style={{ fontSize: '14px' }}>{g.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {wizardResult.guilds?.length === 0 && (
                  <div className="info-box">
                    No servers yet. Make sure to add the bot to a server using the invite link from Step 3.
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => { setShowWizard(false); setWizardStep(0); }}
                >
                  Done ✓
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
