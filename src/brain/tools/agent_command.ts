import * as fs from 'fs';
import * as path from 'path';
import { getAgentStore } from '../agentManager';

/**
 * TOOL: agent_command
 * Jenny uses this to send directives back to an autonomous agent.
 */
export async function execute_agent_command(args: { agent_id: string; operation: 'execute' | 'abandon'; payload?: any }) {
  try {
    const store = getAgentStore();
    const agent = store.agents[args.agent_id];
    if (!agent) throw new Error(`Agent not found: ${args.agent_id}`);

    const directivePath = path.join(process.cwd(), 'workspace', 'agents', agent.folder, 'directive.json');
    
    const directive = {
      timestamp: new Date().toISOString(),
      operation: args.operation,
      payload: args.payload,
      processed: false
    };

    fs.writeFileSync(directivePath, JSON.stringify(directive, null, 2));

    return {
      success: true,
      reply: `✅ Command "${args.operation}" sent to agent **${agent.name}**. It will execute in its next cycle.`,
      data: directive
    };
  } catch (err: any) {
    return {
      success: false,
      reply: `❌ Failed to send command: ${err.message}`,
      error: err.message
    };
  }
}
