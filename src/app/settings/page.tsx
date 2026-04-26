'use client';
import { useState, useEffect } from 'react';

export default function SettingsPage() {
  return (
    <div style={{ padding: '40px 48px', maxWidth: 920, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
          Settings
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 14 }}>
          Configure your preferences and system options.
        </p>
      </header>

      <div style={{ 
        padding: 80, 
        textAlign: 'center', 
        color: 'var(--text-muted)', 
        border: '2px dashed rgba(255,255,255,0.06)', 
        borderRadius: 24,
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Settings coming soon
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          System preferences and configuration options will appear here.
        </div>
      </div>
    </div>
  );
}