const fs = require('fs');
const path = 'e:\\Antigravity\\social-multi-poster\\src\\app\\chat\\page.tsx';
let content = fs.readFileSync(path, 'utf8');

// The marker for the damage
const damageMarker = '      });\n    // 2. Handle User Request';
const replacement = `      });
    }
  }, []);

  // Sync the ref to always point at the latest processInput (avoids stale closures in IPC)
  useEffect(() => {
    processInputRef.current = processInput;
  }, [messages, input, uploadedFile]);

  // ── Unified Input & Response Pipeline ─────────────────────────────────────
  const processInput = async (text?: string, source: 'chat' | 'voice' = 'chat') => {
    const msg = text || input.trim();
    if (!msg && !uploadedFile) return;

    // 1. Setup Request Tracking
    const requestId = \`\${Date.now()}_\${Math.random().toString(36).substring(7)}\`;
    currentRequestRef.current = requestId;

    // Persist file reference
    const fileForPost = uploadedFile;
    if (uploadedFile) lastImageRef.current = uploadedFile;

    // 2. Handle User Request`;

// Try both LF and CRLF
if (content.includes(damageMarker.replace('\\n', '\\r\\n'))) {
    content = content.replace(damageMarker.replace('\\n', '\\r\\n'), replacement.replace(/\\n/g, '\\r\\n'));
} else if (content.includes(damageMarker)) {
    content = content.replace(damageMarker, replacement);
} else {
    // Try even looser match
    const looseMatch = '// 2. Handle User Request';
    if (content.includes(looseMatch)) {
        // Find the line before it
        const lines = content.split(/\\r?\\n/);
        const index = lines.findIndex(l => l.includes(looseMatch));
        if (index > 0 && lines[index-1].includes('});')) {
            lines.splice(index, 0, 
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
                '    if (uploadedFile) lastImageRef.current = uploadedFile;'
            );
            content = lines.join('\\r\\n');
        }
    }
}

// Also apply the ID synchronization fix while we are at it
const idFixTarget = 'const assistantMessageId = `asst-${Date.now()}`;';
const idFixReplacement = `const assistantMessageId = \`asst-\${Date.now()}\`;
      currentRequestRef.current = assistantMessageId;`;

content = content.replace(idFixTarget, idFixReplacement);

// Fix the appendMessage call
const appendTarget = 'appendMessage({';
const appendReplacement = 'await appendMessage({';
const statusTarget = "source: 'primary',";
const statusReplacement = "status: 'streaming',\n        source: 'primary',\n        requestId: assistantMessageId,";

content = content.replace(appendTarget, appendReplacement);
content = content.replace(statusTarget, statusReplacement);

fs.writeFileSync(path, content);
console.log('File fixed successfully');
