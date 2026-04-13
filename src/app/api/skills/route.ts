import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const toolsDir = path.join(process.cwd(), 'src/brain/tools');
    const files = fs.readdirSync(toolsDir);
    
    const skills = files
      .filter(file => file.endsWith('.ts'))
      .map(file => {
        const filePath = path.join(toolsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Try to extract a simple description from the first few lines of comments
        const lines = content.split('\n');
        let description = 'Automated skill for the agent workforce.';
        
        // Find comment block and extract meaningful description
        const commentRows = content.match(/\/\*\*([\s\S]*?)\*\//)?.[1]?.split('\n') || 
                          content.match(/\/\/(.*)/g)?.map(l => l.replace('//', '')) || [];
        
        const cleanRows = commentRows
          .map(row => row.replace(/\*/g, '').trim())
          .filter(row => row && !row.startsWith('TOOL:'));
        
        if (cleanRows.length > 0) {
          description = cleanRows[0];
        }

        return {
          id: file.replace('.ts', ''),
          name: file.replace('.ts', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          fileName: file,
          description: description,
          path: `/brain/tools/${file}`
        };
      });

    return NextResponse.json({ skills });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, code } = await req.json();
    if (!name || !code) return NextResponse.json({ error: 'Name and code required' }, { status: 400 });
    
    const fileName = name.toLowerCase().replace(/\s+/g, '_') + '.ts';
    const filePath = path.join(process.cwd(), 'src/brain/tools', fileName);
    
    fs.writeFileSync(filePath, code);
    
    return NextResponse.json({ success: true, fileName });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
