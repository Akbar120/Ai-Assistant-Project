
const fs = require('fs');
const path = require('path');

const notifPath = path.join(process.cwd(), 'src', 'data', 'agent_notifications.json');
const data = JSON.parse(fs.readFileSync(notifPath, 'utf8'));

let count = 0;
data.notifications.forEach(n => {
  if (n.status === 'pending') {
    // Abandon all Jenny monitoring requests and duplicate DM reports
    if (n.agentName === 'Jenny' || n.text.includes('MONITORING REQUEST')) {
      n.status = 'abandoned';
      n.read = true;
      count++;
    }
  }
});

fs.writeFileSync(notifPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Cleared ${count} spam notifications.`);
