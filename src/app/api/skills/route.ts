import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * Read from /brain/skills/*.md — NOT from tools.
 * Each .md file is a real installed skill.
 */
export async function GET() {
  try {
    const skillsDir = path.join(process.cwd(), 'src/brain/skills');
    const files = fs.readdirSync(skillsDir);

    const skills = files
      .filter(file => file.endsWith('.md'))
      .map(file => {
        const filePath = path.join(skillsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        // Extract name from first # heading or emoji heading
        let name = file.replace('.md', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const headingMatch = content.match(/^#+ .*?(?:Skill:\s*)?(.+)/m);
        if (headingMatch) {
          name = headingMatch[1]
            .replace(/^Skill:\s*/i, '')
            .replace(/[🧠⚡📋🔁✨]/g, '')
            .trim();
        }

        // Extract description from first non-heading paragraph
        let description = 'Installed skill for the agent workforce.';
        let inDescription = false;
        for (const line of lines) {
          if (line.startsWith('#')) { inDescription = true; continue; }
          if (inDescription && line.trim() && !line.startsWith('-') && !line.startsWith('*') && !line.startsWith('`')) {
            description = line.replace(/\*\*/g, '').trim().slice(0, 120);
            break;
          }
        }

        return {
          id: file.replace('.md', ''),
          name,
          fileName: file,
          description,
          content,
          path: `/brain/skills/${file}`
        };
      });

    return NextResponse.json({ skills });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST — Create a new skill (.md file in /brain/skills/)
 * Requires prior user approval via the Improvement system.
 */
export async function POST(req: Request) {
  try {
    const { name, content } = await req.json();
    if (!name || !content) return NextResponse.json({ error: 'name and content required' }, { status: 400 });

    const fileName = name.toLowerCase().replace(/\s+/g, '_') + '.md';
    const filePath = path.join(process.cwd(), 'src/brain/skills', fileName);

    if (fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Skill already exists' }, { status: 409 });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return NextResponse.json({ success: true, fileName });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
