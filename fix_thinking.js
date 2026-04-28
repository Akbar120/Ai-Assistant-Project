const fs = require('fs');
const filePath = 'src/app/chat/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const target = `{isStreamingRef.current && messages.find(m => m.source === 'primary') && (
                      <div style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
                        {messages.find(m => m.source === 'primary')?.content || '...'}
                      </div>
                    )}`;

const replacement = `{isStreamingRef.current && (() => {
                      const activeMsg = [...messages].reverse().find(m => m.source === 'primary');
                      return activeMsg ? (
                        <div style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
                          {activeMsg.content || '...'}
                        </div>
                      ) : null;
                    })()}`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content);
    console.log('SUCCESS');
} else {
    console.log('TARGET NOT FOUND');
}
