const fs = require('fs');
const filePath = 'src/app/chat/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /\{isStreamingRef\.current\s*&&\s*messages\.find\(m\s*=>\s*m\.source\s*===\s*'primary'\)\s*&&\s*\([\s\S]*?\{messages\.find\(m\s*=>\s*m\.source\s*===\s*'primary'\)\?\.content\s*\|\|\s*'\.\.\.'\}[\s\S]*?\)\}/;

const replacement = `{isStreamingRef.current && (() => {
                      const activeMsg = [...messages].reverse().find(m => m.source === 'primary');
                      return activeMsg ? (
                        <div style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
                          {activeMsg.content || '...'}
                        </div>
                      ) : null;
                    })()}`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(filePath, content);
    console.log('SUCCESS');
} else {
    console.log('REGEX FAILED');
}
