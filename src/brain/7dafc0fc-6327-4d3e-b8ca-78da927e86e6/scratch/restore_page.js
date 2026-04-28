const fs = require('fs');
const path = 'e:\\Antigravity\\social-multi-poster\\src\\app\\chat\\page.tsx';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);

// Find the line with "// 2. Handle User Request"
const targetIdx = lines.findIndex(l => l.includes('// 2. Handle User Request'));
if (targetIdx !== -1 && lines[targetIdx-1].includes('});')) {
    const part1 = lines.slice(0, targetIdx);
    const part2 = lines.slice(targetIdx);
    
    const restoration = [
        '    }',
        '  }, []);',
        '',
        '  // Sync the ref to always point at the latest processInput (avoids stale closures in IPC)',
        '  useEffect(() => {',
        '    processInputRef.current = processInput;',
        '  }, [messages, input, uploadedFile]);',
        '',
        '  // ── Unified Input & Response Pipeline ─────────────────────────────────────',
        '  const processInput = async (text?: string, source: \'chat\' | \'voice\' = \'chat\') => {',
        '    const msg = text || input.trim();',
        '    if (!msg && !uploadedFile) return;',
        '',
        '    // 1. Setup Request Tracking',
        '    const requestId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;',
        '    currentRequestRef.current = requestId;',
        '',
        '    // Persist file reference',
        '    const fileForPost = uploadedFile;',
        '    if (uploadedFile) lastImageRef.current = uploadedFile;',
        ''
    ];
    
    const newContent = [...part1, ...restoration, ...part2].join('\n');
    fs.writeFileSync(path, newContent);
    console.log('Restoration successful');
} else {
    console.log('Target not found or already restored. Index:', targetIdx);
}
