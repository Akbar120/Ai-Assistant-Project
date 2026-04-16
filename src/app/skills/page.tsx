'use client';
import { useEffect, useState } from 'react';

interface Skill {
  id: string;
  name: string;
  fileName: string;
  description: string;
  path: string;
}

const SKILL_ICONS: Record<string, string> = {
  agent_creator: '🤖',
  agent_followup: '🔁',
  confirmation_loop: '🔐',
  dataset_creator: '🗄',
  research: '🔍',
  social_manager: '📱',
  system_awareness: '🧠',
  task_manager: '📋',
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSkills(); }, []);

  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);

  const filteredSkills = skills.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '40px 48px', maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <header style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>Installed Skills</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Skills are instruction sets from <code style={{ color: 'var(--accent)', fontSize: 12 }}>/brain/skills/*.md</code> that guide Jenny and agents.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={fetchSkills}
          disabled={isLoading}
          style={{ fontSize: 13, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}
        >
          {isLoading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </header>

      {/* Search */}
      <div style={{ marginBottom: 28 }}>
        <input
          type="text"
          placeholder="Search skills..."
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ height: 42, width: 360, fontSize: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}
        />
        <span style={{ marginLeft: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          {filteredSkills.length} of {skills.length} skills
        </span>
      </div>

      {/* Skills Grid */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading skills...</div>
      ) : filteredSkills.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border-subtle)', borderRadius: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div>No skills found{search ? ' for "' + search + '"' : ''}.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filteredSkills.map(skill => (
            <div
              key={skill.id}
              onClick={() => setActiveSkill(skill)}
              style={{
                padding: 24,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              className="skill-card-hover"
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0
                }}>
                  {SKILL_ICONS[skill.id] || '⚡'}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{skill.name}</div>
                  <code style={{ fontSize: 10, color: 'var(--accent)', opacity: 0.8 }}>{skill.fileName}</code>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                {skill.description.slice(0, 100)}{skill.description.length > 100 ? '…' : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Skill Modal */}
      {activeSkill && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }} onClick={() => setActiveSkill(null)}>
          <div style={{
            background: 'var(--bg-card)', 
            width: '90%', maxWidth: 700, maxHeight: '80vh', 
            borderRadius: 16, border: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 24 }}>{SKILL_ICONS[activeSkill.id] || '⚡'}</div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{activeSkill.name}</h2>
                  <code style={{ fontSize: 11, color: 'var(--accent)' }}>/brain/skills/{activeSkill.fileName}</code>
                </div>
              </div>
              <button 
                onClick={() => setActiveSkill(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 24 }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#0d1117' }}>
              <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, color: '#e5e7eb', whiteSpace: 'pre-wrap' }}>
                {(activeSkill as any).content || 'No content available. Update the API route to serve content.'}
              </pre>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .skill-card-hover:hover {
          background: rgba(108,99,255,0.05) !important;
          border-color: rgba(108,99,255,0.2) !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
