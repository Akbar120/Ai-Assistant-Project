/**
 * /api/chat — Orchestrated Chat Pipeline
 * ─────────────────────────────────────────────────────────────
 * Flow:
 *   1. Receive request (message + optional file + history)
 *   2. enrichInput()        → detect @mentions, #channels, file flag
 *   3. orchestrate()        → LLM decides action + data + reply
 *   4. route to handler     → dm / post / caption / conversation
 *   5. Return { reply, action, result? }
 *
 * The frontend no longer decides actions — it only sends raw input.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OllamaMessage, DEFAULT_MODEL } from '@/lib/ollama';
import { enrichInput } from '@/services/inputEnrichment';
import { orchestrate } from '@/brain/orchestrator';
import { validateDM, executePendingDM, clearPendingDM, getPendingDM } from '@/routers/dm.router';
import { handlePost } from '@/routers/post.router';
import { handleCaption } from '@/routers/caption.router';
import { handleConversation } from '@/routers/conversation.router';
import { addNameCorrection } from '@/services/knowledge';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const message   = (formData.get('message') as string) || '';
    const historyRaw = (formData.get('history') as string) || '[]';
    const file       = formData.get('file') as File | null;

    // Optional: cached contacts forwarded from the frontend to avoid re-fetching
    const cacheRaw   = (formData.get('contactCache') as string) || '{}';

    if (!message && !file) {
      return NextResponse.json({ error: 'Message or file required' }, { status: 400 });
    }

    const history: OllamaMessage[] = JSON.parse(historyRaw);
    const contactCache = JSON.parse(cacheRaw);

    // ── STEP 1: Input Enrichment ────────────────────────────────────────────
    const enriched = enrichInput(message, !!file, contactCache);

    // ── STEP 1.5: Handle DM Confirmation ──────────────────────────────────────
    const pending = getPendingDM();
    const cleanMsg = message.trim().toLowerCase();

    const confirmKeywords = ['yes', 'sahi hai', 'hian', 'kar de', 'bhejde', 'theek hai', 'go ahead', 'okay', 'bhej do'];
    const cancelKeywords = ['no', 'nhi', 'cancel', 'reset', 'abort', 'rehne do', 'nahin', 'naa'];

    const isConfirm = confirmKeywords.some(k => cleanMsg.includes(k));
    const isCancel = cancelKeywords.some(k => cleanMsg.includes(k));

    if (pending && (isConfirm || isCancel)) {
      if (isConfirm) {
        // Execute the pending DM
        const dmResult = await executePendingDM();
        return NextResponse.json({
          reply: dmResult.reply,
          action: 'dm',
          result: dmResult
        });
      } else {
        // Cancel the pending DM
        clearPendingDM();
        return NextResponse.json({
          reply: 'Theek hai, task cancel kar diya. 😊 Kuch aur help chahiye?',
          action: 'conversation'
        });
      }
    }

    // ── Prepare image base64 if file is an image ────────────────────────────
    const images: string[] = [];
    let userContent = message || 'Analyze this image and suggest social media captions.';

    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mime = file.type;

      if (mime.startsWith('image/')) {
        images.push(buffer.toString('base64'));
      } else if (mime.startsWith('video/')) {
        userContent = `User uploaded a video: "${file.name}" (${Math.round(file.size / 1024)}KB). ${message || 'Suggest a social media caption for this video.'}`;
      } else {
        const text = buffer.toString('utf-8').slice(0, 4000);
        userContent = `User uploaded a document: "${file.name}"\n\nContent preview:\n${text}\n\n${message || 'Help create a social media post based on this document.'}`;
      }
    }

    // ── STEP 2: Orchestrator ────────────────────────────────────────────────
    const result = await orchestrate(
      userContent,
      history,
      enriched,
      images.length > 0 ? images : undefined
    );

    const { action, data, reply } = result;

    // ── STEP 3: Route to handler ────────────────────────────────────────────
    let finalReply = reply;
    let actionResult: Record<string, unknown> | undefined;

    switch (action) {
      // ── DM ──────────────────────────────────────────────────────────────
      case 'dm': {
        // Source of truth: Start with current pending DM if it exists
        const pending = getPendingDM();
        
        // Extract new findings from AI data
        const firstUserMention = enriched.context.mentions.find(m => m.type === 'user');
        
        // Merge strategy: AI Data > Existing Pending > Enrichment fallback
        const username = (data.username as string) || pending?.username || firstUserMention?.value || '';
        const platform = (data.platform as 'instagram' | 'twitter' | 'discord') 
                       || pending?.platform 
                       || (firstUserMention?.platform as 'instagram' | 'twitter' | 'discord') 
                       || 'instagram';
        
        // If the AI is performing a 'dm' action but didn't provide a message, 
        // it usually means it's asking for one or the message is being corrected.
        // We should ONLY use the pending message if the AI didn't provide a new one AND 
        // isn't clearly in a 'clarification' phase.
        let dmMessage = (data.message as string);
        if (!dmMessage && pending?.message && !finalReply.toLowerCase().includes('message')) {
            dmMessage = pending.message;
        }
        if (!dmMessage) dmMessage = '';

        // Interactive validation (clarify / confirm / error)
        const validation = validateDM({ 
          username, 
          platform, 
          message: dmMessage, 
          hasFile: enriched.context.hasFile 
        });

        finalReply = validation.reply;
        actionResult = validation.data;
        break;
      }

      // ── POST ─────────────────────────────────────────────────────────────
      case 'post': {
        const caption   = (data.caption   as string)   || message;
        const hashtags  = (data.hashtags  as string[]) || [];
        const platforms = (data.platforms as string[]) || ['instagram'];
        const schedule  = (data.schedule  as string)   || null;

        const postResult = await handlePost({ caption, hashtags, platforms, schedule });
        actionResult = { ...postResult };

        if (postResult.success) {
          finalReply = `🎉 Post published! ${platforms.join(' + ')} par live ho gaya!\n\nKuch aur post karna hai?`;
        } else {
          const errs = Object.entries(postResult.results || {})
            .filter(([, r]) => !r.success)
            .map(([p, r]) => `**${p}**: ${r.error}`)
            .join('\n');
          finalReply = `❌ Posting failed:\n\n${errs || postResult.error}\n\nCheck your account connections in Settings.`;
        }
        break;
      }

      // ── CAPTION ──────────────────────────────────────────────────────────
      case 'caption': {
        const suggestions = (data.suggestions as string[]) || [];
        const captionResult = handleCaption({ suggestions, reply });
        finalReply = captionResult.reply;
        break;
      }

      // ── ASK PLATFORM ─────────────────────────────────────────────────────
      case 'ask_platform': {
        // Store pending DM info in reply (frontend handles the clarification)
        const username  = (data.username as string) || '';
        const dmMessage = (data.message  as string) || message;
        finalReply = `⚠️ Kaunse app pe bhejun?\n\nPlease reply with **Instagram** or **Twitter**.`;
        actionResult = { pendingDm: { username, message: dmMessage } };
        break;
      }

      // ── SCHEDULE ─────────────────────────────────────────────────────────
      case 'schedule': {
        finalReply = reply || `📅 Post scheduled!\n\nScheduled section mein dekh sakte ho.`;
        actionResult = { schedule: data.schedule };
        break;
      }

      // ── LEARN KNOWLEDGE ──────────────────────────────────────────────────
      case 'learn_knowledge': {
        const { misspelled, correct } = data as { misspelled?: string; correct?: string };
        if (misspelled && correct) {
          addNameCorrection(misspelled, correct);
          actionResult = { learned: true, misspelled, correct };
        } else {
          actionResult = { learned: false, error: 'Missing fields' };
        }
        break;
      }

      // ── CONVERSATION (default) ────────────────────────────────────────────
      case 'conversation':
      default: {
        const convResult = handleConversation({ reply: result.reply });
        finalReply = convResult.reply;
        break;
      }
    }

    return NextResponse.json({
      reply: finalReply || "Main sun rahi hoon 😊",
      action: action || "conversation"
    });

  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Chat API] Error:', error);
    return NextResponse.json({ 
      reply: `Error: ${error}`, 
      action: 'conversation',
      error 
    }, { status: 500 });
  }
}
