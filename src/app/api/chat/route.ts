/**
 * /api/chat — Optimized Chat Pipeline with Streaming
 * ─────────────────────────────────────────────────────────────
 * Key optimizations vs original:
 * 1. Streams LLM output via SSE so frontend gets text IMMEDIATELY
 * 2. Sentence-level TTS trigger — voice starts before full reply arrives
 * 3. Smaller history window (6 messages instead of 10)
 * 4. Early JSON extraction — no full-response wait
 * 5. Parallel file processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { OllamaMessage, DEFAULT_MODEL } from '@/lib/ollama';
import { enrichInput } from '@/services/inputEnrichment';
import { orchestrate } from '@/brain/orchestrator';
import { handleConversation } from '@/routers/conversation.router';
import { addNameCorrection } from '@/services/knowledge';
import { execute_instagram_dm } from '@/brain/tools/instagram_dm';
import { execute_platform_post } from '@/brain/tools/platform_post';
import { execute_caption_manager } from '@/brain/tools/caption_manager';
import { runTool } from '@/brain/tools';
import { setPendingAction, getPendingAction, clearPendingAction, agentNotifications, clearAgentNotifications } from '@/brain/state';
import { spawnAgent, updateAgent, restartAgent } from '@/brain/agentManager';
import { appendChatMessages } from '@/lib/chatHistory';
import type { ChatMessage } from '@/lib/chat-types';
import { createTask, updateTask } from '@/brain/taskService';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ── Sentence boundary detection (same logic as ollama.ts helper) ────────────
const SENTENCE_END = /[.!?।]/;

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let buf = '';
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    buf += chars[i];
    if (SENTENCE_END.test(chars[i])) {
      const next = chars[i + 1];
      if (chars[i] === '.' && next && /\d/.test(next)) continue; // skip decimals
      if (buf.trim().length > 3) {
        sentences.push(buf.trim());
        buf = '';
      }
    }
  }
  if (buf.trim().length > 3) sentences.push(buf.trim());
  return sentences;
}

export async function POST(req: NextRequest) {
  let assistantMessageId: string | null = null;

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      console.error('[Chat API] Failed to parse form data:', e);
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const message = (formData.get('message') as string) || '';
    const historyRaw = (formData.get('history') as string) || '[]';
    const file = formData.get('file') as File | null;
    const cacheRaw = (formData.get('contactCache') as string) || '{}';
    assistantMessageId = (formData.get('assistantMessageId') as string) || null;
    const isVoice = req.nextUrl.searchParams.get('voice') === '1' || formData.get('voice') === '1';

    if (!message && !file) {
      return NextResponse.json({ error: 'Message or file required' }, { status: 400 });
    }

    let history: OllamaMessage[] = [];
    try {
      history = JSON.parse(historyRaw);
    } catch {
      history = [];
    }
    
    let contactCache = {};
    try {
      contactCache = JSON.parse(cacheRaw);
    } catch {
      contactCache = {};
    }

    // ── Input Enrichment ────────────────────────────────────────────────────
    const enriched = enrichInput(message, !!file, contactCache);

    // ── Unified Confirmation shortcut ───────────────────────────────────────
    const pending = getPendingAction();
    const cleanMsg = message.trim().toLowerCase();

    const confirmKeywords = ['yes', 'sahi hai', 'hian', 'kar de', 'bhejde', 'theek hai', 'go ahead', 'okay', 'bhej do'];
    const cancelKeywords = ['no', 'nhi', 'cancel', 'reset', 'abort', 'rehne do', 'nahin', 'naa'];

    const isConfirm = confirmKeywords.some(k => cleanMsg.includes(k));
    const isCancel = cancelKeywords.some(k => cleanMsg.includes(k));

    if (pending && (isConfirm || isCancel)) {
      const sendResponse = (reply: string, action: string, result?: any) => {
        if (isVoice) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'full', reply, action, ...(result ? { result } : {}) })}\n\n`));
              controller.close();
            }
          });
          return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
        }
        return NextResponse.json({ reply, action, ...(result ? { result } : {}) });
      };

      if (isConfirm) {
        if (pending.type === 'dm') {
          const res = await execute_instagram_dm(pending.data);
          clearPendingAction();
          return sendResponse(res.reply, 'tool_call', res);
        } else if (pending.type === 'agent_delete') {
          // Execute the confirmed agent deletion
          const { agentId } = pending.data;
          clearPendingAction();
          try {
            const deleteTask = await createTask({ type: 'execution', name: `Delete Agent: ${agentId}`, source: 'orchestrator', status: 'processing' });
            const { runTool } = await import('@/brain/tools');
            const res = await runTool('manage_agent', { operation: 'delete_agent', target_agent: agentId, task_id: deleteTask.id });
            return sendResponse(res.reply || `✅ Agent "${agentId}" deleted successfully.`, 'tool_call', res);
          } catch (err: any) {
            return sendResponse(`❌ Deletion failed: ${err.message}`, 'conversation');
          }
        } else if (pending.type === 'agent_spawn') {
          // ── Create tracking task for agent spawn ──────────────────
          const spawnTask = await createTask({
            type: 'create_agent',
            name: `Creating Agent: ${pending.data.agentName}`,
            owner: 'orchestrator',
            locked: false,
            source: 'chat',
            status: 'processing',
            progress: 10,
          });
          const agent = spawnAgent(pending.data.agentName, pending.data.role, pending.data.goal, pending.data.details);
          const agentFolder = agent.folder || pending.data.agentName.toLowerCase().replace(/\s+/g, '-');
          await updateTask(spawnTask.id, { status: 'completed', progress: 100 }, 'orchestrator').catch(() => undefined);
          clearPendingAction();
          
          const confirmText = `✅ **Agent Created Successfully**\n\n` +
            `- **Name**: ${agent.name}\n` +
            `- **Goal**: ${agent.goal}\n` +
            `- **Skills**: ${(agent.skills || []).join(', ') || 'none'}\n` +
            `- **Tools**: ${(agent.tools || []).join(', ') || 'none'}\n` +
            `- **Workspace Path**: \`workspace/agents/${agentFolder}/\`\n`;
            
          return sendResponse(confirmText, 'create_agent');
        } else if (pending.type === 'agent_edit') {
          const agent = updateAgent(pending.data.agentName, pending.data.role, pending.data.goal);
          clearPendingAction();
          return sendResponse(`✅ Agent **${agent?.name}** metadata has been updated! restarting background tasks...`, 'edit_agent');
        }
      } else {
        clearPendingAction();
        return sendResponse('Theek hai, cancel kar diya. 😊', 'conversation');
      }
    }

    // ── Smart Task Creation — only for real confirmed actions ──────────────
    // (NOT for every message — casual chat gets no task)
    let chatTaskId: string | null = null;

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
        const text = buffer.toString('utf-8').slice(0, 2000); // Reduced from 4000 for speed
        userContent = `User uploaded a document: "${file.name}"\n\nContent:\n${text}\n\n${message || 'Help create a social media post based on this document.'}`;
      }
    }

    // ── Inject Agent Notifications into context ───────────────────────────
    if (agentNotifications?.length > 0) {
      const combinedNote = agentNotifications.map(n => `[AGENT ${n.agentName}]: ${n.text}`).join('\n');
      userContent = `⚠️ NOTIFICATION FROM YOUR AGENTS:\n${combinedNote}\n\nUser Message: ${userContent}`;
      clearAgentNotifications(); // Wipe them after presenting to user
    }

    // ── Stream Mode Configuration ──────────────────────────────────────────
    if (isVoice) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            const result = await orchestrate(
              userContent,
              history || [],
              enriched,
              images?.length > 0 ? images : undefined,
              (sentence) => {
                send({ type: 'sentence', text: sentence });
              }
            );

            const { action, data, reply, taskId } = result;
            if (taskId) {
               chatTaskId = taskId;
            }
            let finalReply = reply;
            let actionResult: Record<string, unknown> | undefined;

            // Handle tool calls in the stream
            if (action === 'tool_call') {
              const { tool, args } = data as { tool: string, args: any };
              if (tool === 'instagram_dm') {
                 finalReply = `⚠️ **Confirm DM**\n\nTo: @${args.username}\nApp: ${args.platform}\nMessage: "${args.message}"\n\nReply YES to confirm.`;
                 setPendingAction({ type: 'dm', data: args });
              } else {
                 try {
                   // Always pass task_id from the orchestrator — security guard requires it
                   const toolArgs = { ...args, task_id: taskId || args.task_id };
                   const res = await runTool(tool, toolArgs);
                   finalReply = res.reply || `✅ Tool '${tool}' executed.`;
                   actionResult = (res as any).data;
                 } catch (toolErr: any) {
                   finalReply = `❌ Tool execution failed: ${toolErr.message}`;
                   console.error(`[Chat API] Tool '${tool}' failed:`, toolErr);
                 }
              }
            } else if (action === 'create_agent') {
              // data can be { tool, args: { name, goal, role, ... } } OR { agentName, goal, role }
              const args = (data as any).args || data;
              const agentName = args.agentName || args.name || (data as any).agentName || 'DM_Master';
              const agentGoal = args.goal || args.objective || (data as any).goal || 'Assist with tasks';
              const agentRole = args.role || (data as any).role || 'Assistant';
              const agentTools = args.tools || args.allowed_tools || [];
              const agentSkills = args.skills || [];
              const agentChannels = args.channels || [];
              const agentDetails = { ...args, agentName, goal: agentGoal, role: agentRole, tools: agentTools, skills: agentSkills, channels: agentChannels };
              setPendingAction({ type: 'agent_spawn', data: { agentName, role: agentRole, goal: agentGoal, details: agentDetails } });
              const toolList = agentTools.length ? `\n🛠 Tools: ${agentTools.join(', ')}` : '';
              const skillList = agentSkills.length ? `\n🧠 Skills: ${agentSkills.join(', ')}` : '';
              const channelList = agentChannels.length ? `\n📡 Channels: ${agentChannels.join(', ')}` : '';
              finalReply = `⚠️ I need an AI Agent to handle this complex task.\n\nAgent: **${agentName}**\nGoal: ${agentGoal}\nRole: ${agentRole}${toolList}${skillList}${channelList}\n\nShall I create it? (Reply YES to approve)`;
            }

            const safeReply = finalReply || 'Main sun rahi hoon 😊';

            // Final Persistence
            if (assistantMessageId) {
              await appendChatMessages([{ id: assistantMessageId, role: 'assistant' as const, content: safeReply, source: 'chat' as const, timestamp: Date.now() }]);
            }

            if (chatTaskId) {
              await updateTask(chatTaskId, {
                status: 'completed',
                progress: 100,
                result: { action: action || 'conversation', reply: safeReply },
              }, 'orchestrator');
            }

            send({ 
              type: 'full', 
              reply: safeReply, 
              action: action || 'conversation',
              ...(actionResult ? { result: actionResult } : {})
            });

            controller.close();
          } catch (err) {
            send({ type: 'error', message: err instanceof Error ? err.message : 'Stream Error' });
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // ── FALLBACK: Standard JSON for Non-Voice ────────────────────────────────
    const result = await orchestrate(
      userContent,
      history,
      enriched,
      images?.length > 0 ? images : undefined
    );
    const { action, data, reply, taskId } = result;
    if (taskId) {
      chatTaskId = taskId;
    }
    let finalReply = reply || 'Samajh rahi hoon...';
    let actionResult: Record<string, unknown> | undefined;

    if (action === 'tool_call') {
      const { tool, args } = data as { tool: string, args: any };
      if (tool === 'instagram_dm') {
         finalReply = `⚠️ **Confirm DM**\n\nTo: @${args.username}\nApp: ${args.platform}\nMessage: "${args.message}"\n\nReply YES to confirm.`;
         setPendingAction({ type: 'dm', data: args });
      } else {
         const res = await runTool(tool, args);
         finalReply = res.reply;
         actionResult = (res as any).data;
      }
    } else if (action === 'create_agent') {
      const args = (data as any).args || data;
      const agentName = args.agentName || args.name || (data as any).agentName || 'DM_Master';
      const agentGoal = args.goal || args.objective || (data as any).goal || 'Assist with tasks';
      const agentRole = args.role || (data as any).role || 'Assistant';
      const agentTools = args.tools || args.allowed_tools || [];
      const agentSkills = args.skills || [];
      const agentChannels = args.channels || [];
      const agentDetails = { ...args, agentName, goal: agentGoal, role: agentRole, tools: agentTools, skills: agentSkills, channels: agentChannels };
      setPendingAction({ type: 'agent_spawn', data: { agentName, role: agentRole, goal: agentGoal, details: agentDetails } });
      const toolList = agentTools.length ? `\n🛠 Tools: ${agentTools.join(', ')}` : '';
      const skillList = agentSkills.length ? `\n🧠 Skills: ${agentSkills.join(', ')}` : '';
      const channelList = agentChannels.length ? `\n📡 Channels: ${agentChannels.join(', ')}` : '';
      finalReply = `⚠️ I need an AI Agent to handle this complex task.\n\nAgent: **${agentName}**\nGoal: ${agentGoal}\nRole: ${agentRole}${toolList}${skillList}${channelList}\n\nShall I create it? (Reply YES to approve)`;
    }

    if (assistantMessageId) {
      await appendChatMessages([{ id: assistantMessageId, role: 'assistant' as const, content: finalReply, source: 'chat' as const, timestamp: Date.now() }]);
    }

    // Create/complete task only for real actions
    if (action === 'tool_call' || action === 'create_agent') {
      const actionTask = await createTask({
        type: action === 'create_agent' ? 'create_agent' : 'execution',
        name: action === 'create_agent'
          ? `Planning Agent: ${(data as any)?.args?.agentName || (data as any)?.agentName || 'unknown'}`
          : `Tool: ${(data as any)?.tool || 'unknown'}`,
        owner: 'orchestrator',
        locked: false,
        source: 'chat',
        status: 'completed',
        progress: 100,
      }).catch(() => undefined);
      void actionTask;
    }

    return NextResponse.json({
      reply: finalReply,
      action: action || 'conversation',
      ...(actionResult ? { result: actionResult } : {}),
    });

  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Chat API] Error:', error);

    if (assistantMessageId) {
      await appendChatMessages([{
        id: assistantMessageId,
        role: 'assistant' as const,
        source: 'chat' as const,
        content: `Error: ${error}`,
        timestamp: Date.now(),
      }]);
    }

    // No chatTaskId to update in the error path (task already created conditionally)

    return NextResponse.json({
      reply: `Error: ${error}`,
      action: 'conversation',
      error,
    }, { status: 500 });
  }
}
