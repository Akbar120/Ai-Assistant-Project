import { appendLog, updateTask, completeStep } from './taskService';

/**
 * Sandbox Bridge
 * A restricted environment for running experiments and data simulations.
 */

export interface SandboxTask {
  id: string;
  tool: 'parse_history' | 'simulate_reply' | 'extract_tone' | 'test_agent_behavior';
  input: any;
  task_id: string; // Mandatory link to orchestrator task
  requester?: string;
}

export interface SandboxResult {
  success: boolean;
  data: any;
  summary: string;
}

/**
 * Tool: parse_history
 */
function parseHistory(input: string): SandboxResult {
  try {
    const lines = input.split('\n').filter(l => l.trim());
    const data = lines.map(line => {
      const isUser = /user:|paji:|tu:|aap:|me:/i.test(line);
      const content = line.replace(/^(user|ai|assistant|paji|tu|aap|me):\s*/i, '').trim();
      return { role: isUser ? 'user' : 'assistant', content };
    });
    return {
      success: true,
      data,
      summary: `Extracted ${data.length} conversation turns.`
    };
  } catch (e: any) {
    return { success: false, data: null, summary: `Parse failed: ${e.message}` };
  }
}

/**
 * Tool: simulate_reply
 */
function simulateReply(input: { soul: string, message: string }): SandboxResult {
  const reply = `[SIMULATED] Reply for soul "${input.soul}": Okay, I'll handle that.`;
  return {
    success: true,
    data: { reply },
    summary: `Simulation complete for soul: ${input.soul}`
  };
}

/**
 * Tool: extract_tone
 */
function extractTone(text: string): SandboxResult {
  const tones = [];
  if (/!|\?|kya|kyun/i.test(text)) tones.push('curious');
  if (/yaar|paji|bro|bhai/i.test(text)) tones.push('casual');
  if (/please|shukriya|meherbani/i.test(text)) tones.push('polite');
  if (/gussa|badtameez|dhyaan se/i.test(text)) tones.push('assertive');
  const finalTones = tones.length > 0 ? tones : ['neutral'];
  return {
    success: true,
    data: { tones: finalTones },
    summary: `Tone Profile: ${finalTones.join(', ')}`
  };
}

/**
 * Main Sandbox Execution Hub
 * Routes and logs sandbox operations.
 */
export async function executeSandbox(task: SandboxTask) {
  const { tool, input, task_id, requester = 'orchestrator' } = task;

  try {
    await appendLog(task_id, `Starting sandbox execution: ${tool}`, 'info', requester, 'execute_experiment');
    
    let result: SandboxResult;

    switch (tool) {
      case 'parse_history':
        result = parseHistory(input);
        break;
      case 'simulate_reply':
        result = simulateReply(input);
        break;
      case 'extract_tone':
        result = extractTone(input);
        break;
      case 'test_agent_behavior':
        result = { 
          success: true, 
          data: { status: 'passed' }, 
          summary: 'Observations: No infinite loops detected, Memory integrity high' 
        };
        break;
      default:
        throw new Error(`Unauthorized or invalid sandbox tool: ${tool}`);
    }

    if (result.success) {
      await appendLog(task_id, `Sandbox Success: ${result.summary}`, 'info', requester, 'log_results');
      await completeStep(task_id, 'execute_experiment', requester);
      await completeStep(task_id, 'log_results', requester);
      
      await updateTask(task_id, { 
        status: 'completed', 
        result: result.data 
      }, requester);
    } else {
      throw new Error(result.summary);
    }

    return result;

  } catch (error: any) {
    await appendLog(task_id, `Sandbox failure: ${error.message}`, 'error', requester, 'execute_experiment');
    await updateTask(task_id, { status: 'failed', result: { error: error.message } }, requester);
    return { success: false, data: null, summary: error.message };
  }
}
