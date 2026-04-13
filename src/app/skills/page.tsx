'use client';
import { useEffect, useState } from 'react';

interface Skill {
  id: string;
  name: string;
  fileName: string;
  description: string;
  path: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({ workspace: true, builtIn: false });

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

  useEffect(() => {
    fetchSkills();
  }, []);

  const filteredSkills = skills.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.description.toLowerCase().includes(search.toLowerCase())
  );

  const toggleCategory = (cat: 'workspace' | 'builtIn') => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div style={{ padding: '24px 32px', width: '100%' }}>
      {/* ─── DASHBOARD PANEL WRAPPER (FULL WIDTH) ─────────────────────── */}
      <div style={{ maxWidth: '100%', marginLeft: '8px' }}>
        
        {/* ─── MAIN DASHBOARD PANEL ─────────────────────────────────────── */}
        <div style={{ 
          padding: '32px', 
          width: '100%', 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid rgba(255,255,255,0.06)', 
          borderRadius: '12px'
        }}>
          
          {/* ─── HEADER ROW ────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Skills</h1>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Manage skill availability and API key injection.</p>
            </div>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={fetchSkills}
              disabled={isLoading}
              style={{ fontSize: '13px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* ─── FILTER ROW ────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px', gap: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Filter</div>
              <input 
                type="text" 
                placeholder="Search skills" 
                className="input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ height: '42px', width: '400px', fontSize: '14px', background: 'rgba(0,0,0,0.2)' }}
              />
            </div>
            <div style={{ paddingBottom: '12px' }}>
               <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {filteredSkills.length} shown
              </span>
            </div>
          </div>

          {/* ─── SECTION: WORKSPACE SKILLS ──────────────────────────────────── */}
          <div 
            onClick={() => toggleCategory('workspace')}
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '10px 0', 
              cursor: 'pointer',
              borderBottom: '1px solid var(--border-subtle)'
            }}
            className="section-header"
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', opacity: 0.8 }}>WORKSPACE SKILLS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{filteredSkills.length}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{expandedCategories.workspace ? '▼' : '▶'}</span>
            </div>
          </div>
          
          {expandedCategories.workspace && (
            <div style={{ margin: '4px 0 20px' }}>
              {filteredSkills.length === 0 ? (
                <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>No skills found.</div>
              ) : (
                filteredSkills.map(skill => (
                  <div 
                    key={skill.id}
                    className="skill-row"
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '10px 16px', 
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      margin: '0 -16px', 
                      borderRadius: '8px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{skill.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>TOOL: {skill.id}</div>
                    </div>
                    <button className="action-btn">▶</button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ─── SECTION: BUILT-IN SKILLS ───────────────────────────────────── */}
          <div 
            onClick={() => toggleCategory('builtIn')}
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '10px 0', 
              cursor: 'pointer',
              borderBottom: '1px solid var(--border-subtle)'
            }}
            className="section-header"
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', opacity: 0.8 }}>BUILT-IN SKILLS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>0</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{expandedCategories.builtIn ? '▼' : '▶'}</span>
            </div>
          </div>
          
          {expandedCategories.builtIn && (
            <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>No built-in skills available.</div>
          )}

        </div>
      </div>
      
      <style jsx>{`
        .skill-row { 
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .skill-row:hover {
          background: rgba(255,255,255,0.03) !important;
        }
        .action-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.06);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .action-btn:hover {
          background: rgba(255,255,255,0.1);
          color: var(--text-primary);
          border-color: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
