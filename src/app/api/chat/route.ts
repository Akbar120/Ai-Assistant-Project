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
import { OllamaMessage } from '@/lib/ollama';
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

    const confirmKeywords = ['yes', 'sahi hai', 'hian', 'kar de', 'kardo', 'bhejde', 'theek hai', 'go ahead', 'okay', 'bhej do', 'approve', 'approved', 'confirm'];
    const cancelKeywords = ['no', 'nhi', 'cancel', 'reset', 'abort', 'rehne do', 'nahin', 'naa', 'deny', 'decline'];
    const retryKeywords = ['retry', 'again', 'wapas', 'try', 'ek aur baar'];
    const explainKeywords = ['explain', 'kyu', 'what', 'kya', 'batao', 'reason', 'detail', 'details'];

    // Only trigger if message is short (simple confirmation) or strictly matches a keyword
    const isShort = cleanMsg.length < 50;
    const isConfirm = isShort && confirmKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(cleanMsg));
    const isCancel = isShort && cancelKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(cleanMsg));
    const isRetry = isShort && retryKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(cleanMsg));
    const isExplain = isShort && explainKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(cleanMsg));

    if (pending && (isConfirm || isCancel || isRetry || isExplain)) {
      const sendResponse = async (reply: string, action: string, result?: any) => {
        const safeReply = reply || 'Main sun rahi hoon dY~S';
        
        // Final Persistence before sending response
        if (assistantMessageId) {
          await appendChatMessages([{ 
            id: assistantMessageId, 
            role: 'assistant' as const, 
            content: safeReply, 
            source: 'chat' as const, 
            timestamp: Date.now() 
          }]);
        }

        if (isVoice) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'full', reply: safeReply, action, ...(result ? { result } : {}) })}\n\n`));
              controller.close();
            }
          });
          return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
        }
        return NextResponse.json({ reply: safeReply, action, ...(result ? { result } : {}) });
      };

      if (pending.type === 'error_recovery') {
        if (isCancel) {
          clearPendingAction();
          return sendResponse('✅ Task cancelled.', 'conversation');
        } else if (isExplain || (!isRetry && !isConfirm)) {
          try {
            const { ollamaChat } = await import('@/lib/ollama');
            const { getActiveModel } = await import('@/lib/ollama-server');
            const expRaw = await ollamaChat({
              messages: [
                { role: 'system', content: 'You are Jenny. A tool just failed. Explain the error naturally to the user in 1-2 short sentences and ask if they want you to retry or fix it.' },
                { role: 'user', content: `Tool: ${pending.data.tool}\nArgs: ${JSON.stringify(pending.data.args)}\nError: ${pending.data.error}` }
              ],
              model: getActiveModel(),
              temperature: 0.3
            });
            return sendResponse(expRaw.trim(), 'conversation');
          } catch (e) {
            return sendResponse(`⚠️ Error Details:\n${pending.data.error}\n\nReply RETRY to try again.`, 'conversation');
          }
        } else if (isRetry || isConfirm) {
          clearPendingAction();
          try {
            const { runToolWithoutGuard } = await import('@/brain/tools');
            const toolArgs = { ...pending.data.args };
            
            // SAFETY: If taskId is missing (e.g. from a failed initial attempt), create one now
            if (!toolArgs.task_id) {
               const { createTask } = await import('@/brain/taskService');
               const newTask = await createTask({
                  type: 'execution',
                  name: `RETRY: ${pending.data.tool}`,
                  source: 'orchestrator',
                  status: 'processing'
               });
               toolArgs.task_id = newTask.id;
            }

            const res = await runToolWithoutGuard(pending.data.tool, toolArgs, 'orchestrator', 'system_jenny');
            return await sendResponse(res.reply || `✨ Retry successful!`, 'tool_call', res);
          } catch (err: any) {
            const errMsg = err.message || 'Unknown error';
            setPendingAction({ type: 'error_recovery', data: { tool: pending.data.tool, args: pending.data.args, error: errMsg } });
            return sendResponse(`❌ Retry failed: ${errMsg}\n\nShould I explain the error or retry again?`, 'conversation');
          }
        }
      }

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
            return await sendResponse(res.reply || `o" Agent "${agentId}" deleted successfully.`, 'tool_call', res);
          } catch (err: any) {
            return await sendResponse(`?O Deletion failed: ${err.message}`, 'conversation');
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
        } else if (pending.type === 'tool') {
          // ── Execute an approved background tool ──────────────────
          clearPendingAction();
          
          // NEW FEATURE: Sync chat approval with Notifications Sidebar
          try {
             const { loadFromFile, markNotificationRead } = await import('@/brain/state');
             const allNotifs = loadFromFile();
             // Mark the most recent approval_needed notification for THIS agent as read/handled
             const targetNotif = allNotifs.slice().reverse().find(n => n.requiresApproval && !n.read);
             if (targetNotif) {
                markNotificationRead(targetNotif.id);
             }
          } catch (e) {
            console.error('[Route] Notification sync failed:', e);
          }

          try {
            const { runToolWithoutGuard } = await import('@/brain/tools');
            const res = await runToolWithoutGuard(pending.data.tool, pending.data.args, 'orchestrator', 'system_jenny');
            
            // Phase 3: Natural explanation for successful tool execution
            let successExplanation = res.reply || `✨ Approved and executed **${pending.data.tool}** successfully.`;
            try {
               const { ollamaChat } = await import('@/lib/ollama');
               const { getActiveModel } = await import('@/lib/ollama-server');
               const expRaw = await ollamaChat({
                  messages: [
                     { role: 'system', content: 'You are Jenny. You just successfully executed a tool after user approval. Explain what you did and the result naturally in 1-2 short sentences. Do not ask questions unless necessary.' },
                     { role: 'user', content: `Tool: ${pending.data.tool}\nResult: ${JSON.stringify(res).substring(0, 500)}` }
                  ],
                  model: getActiveModel(),
                  temperature: 0.3
               });
               if (expRaw && expRaw.trim()) {
                  successExplanation = expRaw.trim();
               }
            } catch (e) {}

            return await sendResponse(successExplanation, 'tool_call', res);
          } catch (err: any) {
            const errMsg = err.message || 'Unknown error';
            setPendingAction({ type: 'error_recovery', data: { tool: pending.data.tool, args: pending.data.args, error: errMsg } });
            return await sendResponse(`⚠️ I encountered an error while executing the task.\n\nShould I attempt to retry, or would you like me to explain the error?`, 'conversation');
          }
        }
      } else {
        clearPendingAction();
        return sendResponse('⏭️ Action cancelled. What would you like to do next?', 'conversation');
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
              (sentence: string, isFirst: boolean, isThought?: boolean) => {
                send({ type: 'sentence', text: sentence, isThought: !!isThought });
              },
              (mode) => {
                send({ type: 'mode', mode });
              }
            );

            const { action, data, reply, taskId, mode } = result;
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
                 const toolArgs = { ...args, task_id: taskId || args.task_id };
                 try {
                   // Always pass task_id from the orchestrator - security guard requires it
                   const res = await runTool(tool, toolArgs, 'orchestrator', 'system_jenny');
                   finalReply = res.reply || `✨ Tool '${tool}' executed.`;
                   actionResult = (res as any).data;
                 } catch (toolErr: any) {
                   const errMsg = toolErr.message || 'Unknown error';
                   if (errMsg.includes('PERMISSION_BLOCK') || errMsg.includes('USER_APPROVAL_REQUIRED')) {
                     const reason = errMsg.replace('[PERMISSION_BLOCK] ', '').replace('USER_APPROVAL_REQUIRED: ', '');
                     finalReply = `⚠️ **Confirm Tool Execution**\n\nI need your permission to run **${tool}**.\n\n${reason}\n\nReply **YES** to confirm or **NO** to cancel.`;
                     setPendingAction({ type: 'tool', data: { tool, args: toolArgs } });
                   } else {
                     finalReply = `❌ Tool execution failed: ${errMsg}`;
                   }
                   console.error(`[Orchestrator] Tool Error (${tool}):`, toolErr);
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

            const safeReply = (finalReply && typeof finalReply === 'string' && finalReply.trim().length > 0) 
              ? finalReply 
              : (reply && typeof reply === 'string' && reply.trim().length > 0)
                ? reply
                : 'Theek hai, main ye kar rahi hoon...';

            // Persistence handled by sendResponse or here if not using shortcut
            if (!isConfirm && !isCancel && assistantMessageId) {
               await appendChatMessages([{ 
                 id: assistantMessageId, 
                 role: 'assistant' as const, 
                 content: safeReply, 
                 source: 'chat' as const, 
                 timestamp: Date.now() 
               }]);
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
              mode: mode || 'conversation',
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
    const { action, data, reply, taskId, mode } = result;
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
         try {
           const res = await runTool(tool, args, 'orchestrator', 'system_jenny');
           finalReply = res.reply;
           actionResult = (res as any).data;
         } catch (toolErr: any) {
           const errMsg = toolErr.message || 'Unknown error';
           if (errMsg.includes('PERMISSION_BLOCK') || errMsg.includes('USER_APPROVAL_REQUIRED')) {
             const reason = errMsg.replace('[PERMISSION_BLOCK] ', '').replace('USER_APPROVAL_REQUIRED: ', '');
             finalReply = `⚠️ **Confirm Tool Execution**\n\nI need your permission to run **${tool}**.\n\n${reason}\n\nReply **YES** to confirm or **NO** to cancel.`;
             setPendingAction({ type: 'tool', data: { tool, args } });
           } else {
             finalReply = `❌ Tool execution failed: ${errMsg}`;
           }
         }
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
      mode: mode || 'conversation',
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
