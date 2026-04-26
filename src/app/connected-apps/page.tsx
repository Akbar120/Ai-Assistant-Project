'use client';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ToastProvider';
import { useRouter } from 'next/navigation';

type Step = 0 | 1 | 2 | 3;

interface DiscordStatus {
  configured: boolean;
  botName?: string;
  clientId?: string;
  guilds?: { id: string; name: string; icon: string | null }[];
}

export default function ConnectedAppsPage() {
  const router = useRouter();
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [twitterConnected, setTwitterConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [discordWebConnected, setDiscordWebConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<Step>(0);
  const [botToken, setBotToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardResult, setWizardResult] = useState<{ botName: string; guilds: { id: string; name: string }[]; inviteUrl?: string } | null>(null);

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
    <div style={{ padding: '40px 48px', maxWidth: 920, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
              Connections
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 14 }}>
              Connect your social media accounts to start posting from a single dashboard.
            </p>
          </div>
          <button
            onClick={loadStatus}
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-muted)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 16 }}>Loading connections...</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Discord Bot */}
          <ConnectionCard
            icon="💬"
            iconColor="#5865F2"
            name="Discord"
            description="Post to channels via Discord Bot (Free — no API fees)"
            connected={discordStatus?.configured}
            botInfo={discordStatus?.botName}
            onDisconnect={disconnectDiscord}
            onConnect={() => { setShowWizard(true); setWizardStep(0); }}
          />

          {/* Discord Personal */}
          <ConnectionCard
            icon="👤"
            iconColor="#5865F2"
            name="Discord (Personal)"
            description="Log in to fetch personal DMs for Notifications"
            connected={discordWebConnected}
            onDisconnect={() => disconnectAutomation('discord-web')}
            onConnect={() => connectAutomation('discord-web')}
            loading={automationLoading === 'discord-web'}
            infoText={!discordWebConnected ? "Click 'Connect' to open discord.com/login. Log in normally — your session cookies are saved locally. No passwords are stored." : undefined}
          />

          {/* X/Twitter */}
          <ConnectionCard
            icon="𝕏"
            iconColor="#fff"
            name="X / Twitter"
            description="Post tweets via browser automation — no paid API needed"
            connected={twitterConnected}
            onDisconnect={() => disconnectAutomation('twitter')}
            onConnect={() => connectAutomation('twitter')}
            loading={automationLoading === 'twitter'}
            infoText={!twitterConnected ? "Click 'Connect' to open twitter.com/login. Log in normally — your session cookies are saved locally." : undefined}
          />

          {/* Instagram */}
          <ConnectionCard
            icon="📸"
            iconColor="#E1306C"
            name="Instagram"
            description="Post feed photos, reels, and stories via browser automation"
            connected={instagramConnected}
            onDisconnect={() => disconnectAutomation('instagram')}
            onConnect={() => connectAutomation('instagram')}
            loading={automationLoading === 'instagram'}
            infoText={!instagramConnected ? "Click 'Connect' to open instagram.com/login. Log in once — session is saved securely." : undefined}
          />

          {/* Security Note */}
          <div style={{
            padding: 20,
            borderRadius: 16,
            border: '1px solid rgba(34,197,94,0.2)',
            background: 'rgba(34,197,94,0.03)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#34d399' }}>
              🔐 Security & Privacy
            </div>
            <ul style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 1.9, margin: 0 }}>
              <li>Passwords are <strong style={{ color: 'var(--text-primary)' }}>never</strong> stored — only session cookies</li>
              <li>Cookies are stored locally in the <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>sessions/</code> folder</li>
              <li>All automation runs on your device — nothing sent to external servers</li>
              <li>Revoke access anytime by clicking Disconnect</li>
            </ul>
          </div>
        </div>
      )}

      {/* Discord Wizard Modal */}
      {showWizard && (
        <div 
          onClick={(e) => e.target === e.currentTarget && setShowWizard(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div style={{ background: 'var(--bg-base)', borderRadius: 20, maxWidth: 580, width: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>💬 Connect Discord Bot</div>
              <button 
                onClick={() => { setShowWizard(false); setWizardStep(0); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', gap: 8, marginBottom: 16 }}>
              {['Create Bot', 'Get Token', 'Add to Server', 'Connected'].map((label, i) => (
                <div 
                  key={i} 
                  style={{ 
                    flex: 1, 
                    padding: '8px 12px', 
                    borderRadius: 10, 
                    fontSize: 11,
                    textAlign: 'center',
                    background: wizardStep === i ? 'var(--accent)' : wizardStep > i ? '#34d399' : 'rgba(255,255,255,0.04)',
                    color: wizardStep >= i ? '#fff' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  <div>{wizardStep > i ? '✓' : i + 1}</div>
                  <div>{label}</div>
                </div>
              ))}
            </div>

            {wizardStep === 0 && (
              <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Step 1: Create a Discord Application</div>
                <ol style={{ fontSize: 14, color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 2 }}>
                  <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>discord.com/developers/applications</a></li>
                  <li>Click <strong>"New Application"</strong> and give it a name</li>
                  <li>In the left sidebar, click <strong>"Bot"</strong></li>
                  <li>Click <strong>"Add Bot"</strong> and confirm</li>
                </ol>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(108,99,255,0.08)', fontSize: 13, color: 'var(--accent)' }}>
                  💡 The Discord Developer Portal is free. No credit card or payment required.
                </div>
                <button onClick={() => setWizardStep(1)} style={{ padding: '12px 20px', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  I've created the app →
                </button>
              </div>
            )}

            {wizardStep === 1 && (
              <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Step 2: Get Your Bot Token & Client ID</div>
                <ol style={{ fontSize: 14, color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 2 }}>
                  <li>In the Bot page, click <strong>"Reset Token"</strong></li>
                  <li>Copy the token and paste it below</li>
                  <li>Also go to <strong>General Information</strong> and copy the <strong>Application ID</strong></li>
                </ol>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--text-muted)' }}>Bot Token *</div>
                  <input
                    type="password"
                    placeholder="MTxxxxxxxx.GyyUJx.xxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--text-muted)' }}>Application ID (Client ID)</div>
                  <input
                    type="text"
                    placeholder="1234567890123456789"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13 }}
                  />
                </div>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 13, color: '#f59e0b' }}>
                  ⚠️ Keep your bot token secret! Never share it publicly.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setWizardStep(0)} style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
                  <button onClick={() => setWizardStep(2)} disabled={!botToken} style={{ flex: 1, padding: '12px 20px', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: !botToken ? 0.5 : 1 }}>
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Step 3: Add Bot to Your Server</div>
                <ol style={{ fontSize: 14, color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 2 }}>
                  <li>Go to <strong>OAuth2 → URL Generator</strong> in the Developer Portal</li>
                  <li>Under scopes, check <strong>bot</strong></li>
                  <li>Under permissions, check <strong>Send Messages</strong> and <strong>Attach Files</strong></li>
                  <li>Copy the generated URL and open it in your browser</li>
                  <li>Select your server and authorize</li>
                </ol>
                {clientId && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Or use this pre-built invite link:</div>
                    <div style={{ padding: 12, borderRadius: 10, background: '#0a0a0a', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=2048&scope=bot`}
                    </div>
                    <button
                      onClick={() => window.open(`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=2048&scope=bot`, '_blank')}
                      style={{ marginTop: 10, padding: '10px 16px', borderRadius: 10, background: '#5865F2', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                    >
                      🔗 Open Invite Link
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setWizardStep(1)} style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
                  <button
                    onClick={submitDiscordBot}
                    disabled={wizardLoading}
                    style={{ flex: 1, padding: '12px 20px', borderRadius: 12, background: '#34d399', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                  >
                    {wizardLoading ? 'Connecting…' : '✓ Connect Bot'}
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && wizardResult && (
              <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 48 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>Discord Connected!</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Bot <strong>{wizardResult.botName}</strong> is ready to post.
                </div>
                {wizardResult.guilds && wizardResult.guilds.length > 0 && (
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Accessible Servers:</div>
                    {wizardResult.guilds.map((g) => (
                      <div key={g.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 6, fontSize: 14 }}>
                        🏠 {g.name}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setShowWizard(false); setWizardStep(0); }}
                  style={{ padding: '12px 24px', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  Done ✓
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionCard({ 
  icon, 
  iconColor, 
  name, 
  description, 
  connected, 
  botInfo,
  onDisconnect, 
  onConnect, 
  loading,
  infoText,
}: { 
  icon: string; 
  iconColor: string; 
  name: string; 
  description: string; 
  connected?: boolean;
  botInfo?: string;
  onDisconnect: () => void; 
  onConnect: () => void;
  loading?: boolean;
  infoText?: string;
}) {
  return (
    <div style={{
      borderRadius: 20,
      border: `1px solid ${connected ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}`,
      background: connected ? 'rgba(52,211,153,0.03)' : 'rgba(255,255,255,0.02)',
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: `${iconColor}15`,
          border: `1px solid ${iconColor}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{description}</div>
        </div>
        {connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 10, background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#34d399', marginRight: 6, animation: 'pulse 1.5s infinite' }} />
              Connected
            </span>
            <button 
              onClick={onDisconnect}
              style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={loading}
            style={{
              padding: '10px 18px',
              borderRadius: 12,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Opening…' : 'Connect'}
          </button>
        )}
      </div>
      {connected && botInfo && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>🤖 Bot: {botInfo}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Ready to post to your servers</div>
        </div>
      )}
      {infoText && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.1)', fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--accent)' }}>How it works:</strong> {infoText}
        </div>
      )}
    </div>
  );
}