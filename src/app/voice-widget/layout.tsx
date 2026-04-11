export default function VoiceWidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'transparent', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {children}
    </div>
  );
}
