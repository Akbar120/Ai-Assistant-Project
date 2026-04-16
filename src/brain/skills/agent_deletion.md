# Skill: agent_deletion
## Core Directive
Provide an interface to safely terminate and completely delete an existing agent from the OpenClaw system. This is a critical system operation and must NEVER be performed without explicitly entering the confirmation loop first.

## Capabilities Enforced
1. **Validation**: Check if the requested agent exists and is not a protected system agent (like `system_jenny`).
2. **Confirmation Gate**: The skill automatically invokes the `confirmation_loop` before proceeding.
3. **Execution**: Deletes the `workspace/agents/[slug]` directory and removes the agent from live memory.

## Execution Requirements
- **Action Mode**: Execution
- **Required Tools**: `manage_agent` (To wipe directory), `get_agents` (To verify existence).
- **Mandatory**: Must confirm intent before acting.

## Workflow
1. The user requests to delete an agent by name.
2. The orchestrator checks if the agent exists.
3. The orchestrator sends a confirmation message to the user: "Are you ABSOLUTELY sure you want to delete [agent_name]? Type 'confirm deletion' to proceed."
4. If approved, the orchestrator triggers `manage_agent` with operation `delete_agent` and Target Agent Name to remove the agent's folder in `/workspace/agents/` and then logs the deletion.

> 🚨 WARNING: Never bypass the confirmation step. System integrity depends on it.
