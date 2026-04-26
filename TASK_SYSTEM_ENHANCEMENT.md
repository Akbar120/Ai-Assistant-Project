# TASK SYSTEM ENHANCEMENT IMPLEMENTATION PLAN

## Project Overview

This document outlines a comprehensive enhancement to the task management system that provides clear visibility and control over all agent operations. The current system has issues where "anything becomes a task, anything goes in anything" - this plan addresses those problems with a structured, permission-aware workflow.

---

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [Problems Identified](#problems-identified)
3. [Solution Architecture](#solution-architecture)
4. [New Task Status System](#new-task-status-system)
5. [Implementation Phases](#implementation-phases)
6. [Detailed Code Changes](#detailed-code-changes)
7. [Enhanced Task Flow](#enhanced-task-flow)
8. [UI Enhancements](#ui-enhancements)
9. [Testing Plan](#testing-plan)

---

## Current System Analysis

### Existing Components

```
├── src/brain/
│   ├── taskService.ts      # Core task management (267 lines)
│   ├── orchestrator.ts    # Task creation via shouldCreateTask()
│   └── tools/
│       ├── index.ts       # Tool execution
│       └── refinedPermissionGuard.ts  # Permission checking
├── src/app/api/
│   └── tasks/
│       └── route.ts      # Task API endpoints
├── src/app/tasks/
│   └── page.tsx         # Task UI (316 lines)
└── src/data/tasks/      # Task storage (~200+ task files)
```

### Current Task Status Types

```typescript
type TaskStatus = 'created' | 'processing' | 'waiting_input' | 'partial' | 'completed' | 'failed' | 'abandoned';
```

### Current Task Templates

```typescript
const TASK_TEMPLATES: Record<string, string[]> = {
  create_agent: ['analyze_intent', 'provision_workspace', 'generate_dna', 'register_agent'],
  dataset_creation: ['parse_history', 'tag_turns', 'structure_json', 'persist_dataset'],
  sandbox: ['validate_sandbox_tool', 'execute_experiment', 'log_results'],
  execution: ['prepare_tools', 'execute_payload', 'verify_output'],
  generic: ['initialize', 'process', 'finalize'],
};
```

---

## Problems Identified

### Problem 1: Inconsistent Task Creation
- **Issue**: Tasks are only created for specific intent types (agent_creation, external_action, automation) in the orchestrator
- **Impact**: Many user requests that should generate tasks don't create them
- **Example**: User asks "post this to instagram" - might not create a tracked task

### Problem 2: No Permission-Aware Task States
- **Issue**: There is no "waiting_permission" state - permission requests go to notifications panel separately
- **Impact**: Users don't see which task is waiting for their approval

### Problem 3: Tool Execution Not Linked to Tasks
- **Issue**: Tools execute but task progress isn't always updated
- **Impact**: Task progress bar shows 0% or 100% with no visibility into what's happening

### Problem 4: No Tool Dependency Analysis
- **Issue**: Tasks don't show what tools need to be executed and in what order
- **Impact**: Users don't know what's needed to complete a task

### Problem 5: Poor Error Handling Visibility
- **Issue**: Failed tasks don't show WHY they failed or what error occurred
- **Impact**: Users can't help diagnose or fix issues

### Problem 6: Permission Responses Not Linked to Tasks
- **Issue**: Users approve/deny permissions but don't see which task needs the action
- **Impact**: Disconnected workflow between tasks and permissions

---

## Solution Architecture

### Core Principle

**Every agent operation becomes a tracked task with:**
1. Clear start and end points
2. Visible tool execution plan
3. Permission checkpoints
4. Progress tracking
5. User input requirements
6. Success/failure states

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER INTERFACE                                │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │Task Cards  │  │Notifications│  │   Command Input        │   │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TASK API LAYER                              │
│  ┌───────────┐  ┌─────────────┐  ┌──────────────────────────┐   │
│  │GET Tasks  │  │POST Tasks  │  │  PATCH (Status, Logs)     │   │
│  │Filter    │  │Create      │  │  Update Progress         │   │
│  └───────────┘  └─────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TASK SERVICE LAYER                             │
│  ┌──────────────────┐  ┌──────────────────────────────────┐   │
│  │Task Creation    │  │  Task Permission Service         │   │
│  │- Tool Analysis  │  │  - Track pending permissions      │   │
│  │- Step Planning  │  │  - Link to task ID                │   │
│  │- Status Mgmt    │  │  - Handle approval/denial        │   │
│  └──────────────────┘  └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PERMISSION & TOOL LAYER                           │
│  ┌─────────────────────┐  ┌────────────────────────────────┐  │
│  │RefinedPermission   │  │  Tool Registry                  │  │
│  │Guard              │  │  - executeTool                  │  │
│  │- Check permissions│  │  - Update task on complete       │  │
│  │- Create requests │  │  - Link to task                │  │
│  └─────────────────────┘  └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## New Task Status System

### Extended Status Types

```typescript
// New status types with clear meanings
export type TaskStatus = 
  | 'created'           // Task just created, analyzing what to do
  | 'planning'          // Analyzing tools and dependencies needed
  | 'waiting_permission' // Blocked - waiting for user approval
  | 'ready'            // Ready to execute (permissions granted)
  | 'processing'      // Actively executing tools
  | 'waiting_input'    // Blocked - waiting for user input
  | 'partial'         // Some tools completed, some failed
  | 'completed'       // All tools executed successfully
  | 'failed'          // Task failed (error or denied)
  | 'abandoned';      // User cancelled the task
```

### Status Flow Diagram

```
                        ┌─────────────┐
                        │  CREATED    │
                        │ (new task) │
                        └──────┬──────┘
                               │ analyze requirements
                               ▼
                        ┌─────────────┐
              ┌─────────►│  PLANNING   │◄────────────┐
              │         └──────┬──────┘             │
              │                │ determine tools     │
              │                ▼                    │
              │        ┌────────────────┐         │
              │        │ Checktool      │         │
              │        │ requirements   │         │
              │        └───────┬────────┘         │
              │                │                    │
              │    ┌──────────┴──────────┐   │
              │    │                     │   │
        ┌──────▼──────┐          ┌────▼────────┐
        │   WAITING   │          │    READY     │
        │PERMISSION  │          │  (all tools  │
        │ (userneeds │          │   approved)  │
        │ approval) │          └──────┬─────┘
        └──────┬─────┘                 │
               │                      │
     user grants│                 execute tools
               │                      │
     user denies│           ┌──────────▼──────────┐
               │           │    PROCESSING      │
               │           │ (executing tools)   │
               │           └──────────┬────────┘
               │                    │
               │    ┌─────────────┴─────────────┐
               │    │                           │
          ┌─────▼────┐                   ┌────▼──────────┐
          │  FAILED  │                   │ COMPLETED    │
          │(denied) │                   │ (success)    │
          └─────────┘                   └──────────────┘

        WAITING_INPUT ←───────────► PROCESSING
        (need more user info)      (active work)
               │                      │
               │ provide input        │
               └───────►┌─────────────┘
                          │ need more input
                          ▼
                    ┌─────────────┐
                    │   PARTIAL   │
                    │(partial    │
                    │ success)   │
                    └───────────┘
```

### Task Properties (Enhanced)

```typescript
export interface Task {
  id: string;
  type: string;
  name: string;
  description?: string;  // NEW: human-readable description
  
  owner: string;
  locked: boolean;
  
  session_id?: string;
  source: string;
  
  status: TaskStatus;
  progress: number;  // 0-100 based on completed steps
  
  // Enhanced step system
  steps: TaskStep[];
  
  // NEW: Tool execution plan
  toolPlan: ToolExecutionPlan;
  
  // NEW: Permission tracking
  permissions: PermissionRequirement[];
  
  // NEW: Error tracking
  errors: TaskError[];
  
  logs: LogItem[];
  created_at: string;
  updated_at: string;
  
  // NEW: Links
  parent_id?: string;
  linked_notification_id?: string;
  result?: any;
  
  // NEW: Timing
  started_at?: string;
  completed_at?: string;
  estimated_completion_time?: number;  // seconds
}

export interface ToolExecutionPlan {
  tools: PlannedTool[];
  currentToolIndex: number;
  executionOrder: string[];
  dependencies: Record<string, string[]>;
  estimatedDuration: number;  // seconds
  completedTools: string[];
  failedTools: string[];
}

export interface PlannedTool {
  id: string;
  name: string;
  args: Record<string, any>;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
  estimatedDuration: number;
  requiresUserInput: boolean;
  dependsOn: string[];
}

export interface PermissionRequirement {
  toolName: string;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
  respondedAt?: string;
  response?: string;
}

export interface TaskError {
  toolName?: string;
  step?: string;
  message: string;
  timestamp: string;
  recoverable: boolean;
}
```

---

## Implementation Phases

### Phase 1: Core Service Updates (Priority: HIGH)

#### 1.1 Update Task Service (`src/brain/taskService.ts`)

**Goals:**
1. Add new status types
2. Add tool planning capabilities
3. Add permission requirement tracking
4. Add error tracking

**New Functions to Add:**

```typescript
// Add to taskService.ts

/**
 * Enhanced task creation with tool analysis
 */
export async function createEnhancedTask(data: {
  type: string;
  name: string;
  description?: string;
  source: string;
  requirements?: string;  // User's original request
  owner?: string;
}): Promise<Task> {
  // 1. Create basic task
  // 2. Analyze required tools
  // 3. Build tool execution plan
  // 4. Determine permission requirements
  // 5. Set initial status based on permission needs
}

/**
 * Analyze what tools are needed for a task
 */
export async function analyzeRequiredTools(
  taskType: string, 
  message: string,
  enriched: AgentContext
): Promise<ToolExecutionPlan> {
  // Use AI or rule-based analysis to determine:
  // - What tools are needed
  // - Execution order
  // - Dependencies between tools
  // - Estimated duration
  // - Permission requirements
}

/**
 * Update task to waiting_permission status
 */
export async function setTaskWaitingPermission(
  taskId: string,
  permission: PermissionRequirement
): Promise<Task | null> {
  // Add permission requirement
  // Update status to waiting_permission
  // Link notification to task
}

/**
 * Handle permission response for a task
 */
export async function respondToTaskPermission(
  taskId: string,
  toolName: string,
  approved: boolean,
  response?: string
): Promise<Task | null> {
  // Update permission status
  // If approved and all permissions ready, update to 'ready'
  // If denied, mark tool as denied and possibly fail task
}

/**
 * Link tool execution to task progress
 */
export async function updateToolExecutionProgress(
  taskId: string,
  toolName: string,
  status: 'executing' | 'completed' | 'failed',
  result?: any,
  error?: string
): Promise<void> {
  // Update tool in execution plan
  // Update task progress
  // Update task status based on result
}
```

#### 1.2 Create Task Permission Service (`src/brain/taskPermissionService.ts`)

**New File to Create:**

```typescript
// src/brain/taskPermissionService.ts

import { addAgentNotification, updateNotificationStatus } from './state';
import { setTaskWaitingPermission, respondToTaskPermission, getTask } from './taskService';
import { classifyTool } from './tools/refinedPermissionGuard';

export interface TaskPermissionRequest {
  taskId: string;
  toolName: string;
  args: Record<string, any>;
  agentId: string;
  agentName: string;
  permissionLevel: 'safe' | 'major' | 'blocked';
  reason?: string;
}

/**
 * Request permission for a task's tool
 * Creates notification and links to task
 */
export async function requestTaskPermission(request: TaskPermissionRequest): Promise<{
  allowed: boolean;
  notificationId: string;
}> {
  const { taskId, toolName, args, agentId, agentName } = request;
  
  // Create detailed notification linked to task
  const notification = await addAgentNotification(
    agentId,
    agentName,
    generatePermissionRequestMessage(request),
    'approval_needed',
    true  // requiresApproval
  );
  
  // Update task to show waiting permission
  await setTaskWaitingPermission(taskId, {
    toolName,
    permissionLevel: classifyTool(toolName),
    status: 'pending',
    requestedAt: new Date().toISOString()
  });
  
  return {
    allowed: false,  // Block execution until approved
    notificationId: notification.id
  };
}

/**
 * Handle user's response to permission request
 */
export async function handlePermissionResponse(
  notificationId: string,
  approved: boolean,
  taskId?: string
): Promise<void> {
  // Find the permission requirement in task
  if (taskId) {
    // Update task permission status
    // If approved and all permissions ready, set task to 'ready'
    // If denied, handle appropriately
  }
  
  // Update notification status
  updateNotificationStatus(notificationId, approved ? 'handled' : 'abandoned');
}

/**
 * Generate user-friendly permission request message
 */
function generatePermissionRequestMessage(request: TaskPermissionRequest): string {
  const { toolName, args, agentName, taskId } = request;
  
  return `
🔒 **Permission Required for Task**

**Task ID:** ${taskId}
**Agent:** ${agentName}
**Tool:** ${toolName}

**Details:**
${formatToolArguments(toolName, args)}

**Action Required:**
${approved ? 'This action has been approved' : 'Please confirm or deny this action'}
`.trim();
}
```

### Phase 2: Permission Guard Integration (Priority: HIGH)

#### 2.1 Update Refined Permission Guard

**Changes to `src/brain/tools/refinedPermissionGuard.ts`:**

1. Add task ID parameter to permission check
2. Integrate with Task Permission Service
3. Return task-specific permission states

```typescript
// Add task-aware permission check
export async function enforcePermissionWithTask(
  tool: string, 
  args: any, 
  agentId?: string,
  taskId?: string  // NEW: link to task
): Promise<{
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  taskId?: string;
  permissionRequest?: TaskPermissionRequest;
}> {
  const classification = classifyTool(tool, agentId);
  
  switch (classification) {
    case 'safe':
      return { allowed: true, reason: 'SAFE_TOOL', requiresApproval: false };
      
    case 'blocked':
      if (agentId === 'system_jenny') {
        // Jenny can request blocked tools with approval
        const permissionRequest = await createPermissionRequest(tool, args, agentId, taskId);
        return {
          allowed: false,
          reason: 'USER_APPROVAL_REQUIRED',
          requiresApproval: true,
          taskId,
          permissionRequest
        };
      }
      return {
        allowed: false,
        reason: 'TOOL_BLOCKED',
        requiresApproval: false,
        taskId
      };
      
    case 'major':
      const permissionRequest = await createPermissionRequest(tool, args, agentId, taskId);
      return {
        allowed: false,
        reason: 'USER_APPROVAL_REQUIRED',
        requiresApproval: true,
        taskId,
        permissionRequest
      };
  }
}

async function createPermissionRequest(
  tool: string,
  args: any,
  agentId?: string,
  taskId?: string
): Promise<TaskPermissionRequest> {
  const agentStore = getAgentStore();
  const agent = agentId ? agentStore.agents[agentId] : null;
  
  return {
    taskId: taskId || 'pending',
    toolName: tool,
    args,
    agentId: agentId || 'orchestrator',
    agentName: agent?.name || 'System',
    permissionLevel: classifyTool(tool, agentId)
  };
}
```

### Phase 3: Orchestrator Enhancement (Priority: HIGH)

#### 3.1 Update Task Creation Logic

**Changes to `src/brain/orchestrator.ts`:**

1. Create tasks for ALL meaningful operations
2. Analyze tool requirements upfront
3. Link tasks to permission system

```typescript
// Modify orchestrate function

export async function orchestrate(
  message: string,
  history: OllamaMessage[],
  enriched: AgentContext,
  images?: string[],
  onSentence?: (sentence: string) => void
): Promise<OrchestratorResult> {
  
  // 1. Analyze intent
  const intent = detectIntentType(message);
  
  // 2. ALWAYS create a task for meaningful operations
  let activeTaskId: string | undefined;
  
  if (shouldCreateTask(intent)) {
    // Use enhanced task creation
    const newTask = await createEnhancedTask({
      type: getTaskTypeFromIntent(intent),
      name: generateTaskName(message, intent),
      description: `Task to: ${message.substring(0, 100)}`,
      source: 'orchestrator',
      requirements: message  // Store original request
    });
    
    activeTaskId = newTask.id;
    
    // Analyze required tools BEFORE execution
    const toolPlan = await analyzeRequiredTools(
      getTaskTypeFromIntent(intent),
      message,
      enriched
    );
    
    // Update task with tool plan
    await updateTask(activeTaskId, { toolPlan });
    
    // Check if any tools need permission
    const requiresPermission = toolPlan.tools.some(t => t.permissionLevel !== 'safe');
    
    if (requiresPermission) {
      // Set task to waiting_permission status
      await updateTask(activeTaskId, { 
        status: 'waiting_permission',
        logs: [...newTask.logs, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Task requires user permission before execution'
        }]
      });
    } else {
      // Ready to execute
      await updateTask(activeTaskId, { 
        status: 'processing',
        progress: 0
      });
    }
  }
  
  // Continue with normal orchestration...
  // But ensure tools link back to taskId
}
```

### Phase 4: API Updates (Priority: MEDIUM)

#### 4.1 Extend Task API

**Changes to `src/app/api/tasks/route.ts`:**

```typescript
// GET - List tasks with better filtering
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const waitingFor = searchParams.get('waiting_for');  // NEW: filter by waiting type
  
  let tasks = await getAllTasks();
  
  if (statusFilter && statusFilter !== 'all') {
    tasks = tasks.filter(t => t.status === statusFilter);
  }
  
  if (waitingFor === 'permission') {
    tasks = tasks.filter(t => t.status === 'waiting_permission');
  } else if (waitingFor === 'input') {
    tasks = tasks.filter(t => t.status === 'waiting_input');
  }
  
  return NextResponse.json(tasks);
}

// NEW: PATCH Permission Response
export async function PATCH(req: NextRequest) {
  const data = await req.json();
  
  // Handle permission response
  if (data.action === 'respond_permission') {
    const { taskId, toolName, approved, response } = data;
    
    const task = await respondToTaskPermission(taskId, toolName, approved, response);
    return NextResponse.json(task);
  }
  
  // Handle regular task updates (existing)
  const { id, ...updates } = data;
  const updatedTask = await updateTask(id, updates);
  return NextResponse.json(updatedTask);
}
```

### Phase 5: UI Enhancements (Priority: MEDIUM)

#### 5.1 Enhanced Task Page UI

**Changes to `src/app/tasks/page.tsx`:**

1. Add "Waiting Permission" tab
2. Show permission requirements in task cards
3. Add approval/deny buttons in task cards
4. Show tool execution progress

```typescript
// New tab configuration
type TabType = 'Active' | 'Waiting Permission' | 'Waiting Input' | 'Completed' | 'Failed';

const STATUS_CONFIG: Record<TaskStatus, { color: string; label: string; tab: TabType }> = {
  created: { color: '#94a3b8', label: 'Created', tab: 'Active' },
  planning: { color: '#8b5cf6', label: 'Planning', tab: 'Active' },
  waiting_permission: { color: '#f59e0b', label: 'Waiting Permission', tab: 'Waiting Permission' },
  ready: { color: '#22c55e', label: 'Ready', tab: 'Active' },
  processing: { color: '#facc15', label: 'Processing', tab: 'Active' },
  waiting_input: { color: '#3b82f6', label: 'Waiting Input', tab: 'Waiting Input' },
  partial: { color: '#fb923c', label: 'Partial Success', tab: 'Completed' },
  completed: { color: '#22c55e', label: 'Completed', tab: 'Completed' },
  failed: { color: '#ef4444', label: 'Failed', tab: 'Failed' },
  abandoned: { color: '#64748b', label: 'Abandoned', tab: 'Failed' },
};

// Enhanced TaskCard component
function TaskCard({ task, onApprovePermission, onDenyPermission }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.created;
  
  return (
    <div className="task-card">
      {/* Header with status */}
      <div className="task-header">
        <TaskIcon type={task.type} />
        <TaskInfo task={task} />
        <StatusBadge status={task.status} config={cfg} />
      </div>
      
      {/* Tool Execution Plan */}
      {task.toolPlan && (
        <ToolPlanDisplay 
          plan={task.toolPlan} 
          onApprove={onApprovePermission}
          onDeny={onDenyPermission}
        />
      )}
      
      {/* Permission Requirements */}
      {task.permissions && task.permissions.length > 0 && (
        <PermissionRequirements 
          permissions={task.permissions}
          onApprove={onApprovePermission}
          onDeny={onDenyPermission}
        />
      )}
      
      {/* Progress and Steps */}
      <ProgressSection task={task} />
      
      {/* Error Display */}
      {task.errors && task.errors.length > 0 && (
        <ErrorDisplay errors={task.errors} />
      )}
      
      {/* Logs */}
      {expanded && <LogDisplay logs={task.logs} />}
    </div>
  );
}
```

---

## Detailed Code Changes

### File 1: Update Task Service

```typescript
// src/brain/taskService.ts - Key additions

// Add new status types to export
export type TaskStatus = 
  | 'created'
  | 'planning'
  | 'waiting_permission'
  | 'ready'
  | 'processing'
  | 'waiting_input'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'abandoned';

// Add new interfaces
export interface ToolExecutionPlan {
  tools: PlannedTool[];
  currentToolIndex: number;
  executionOrder: string[];
  dependencies: Record<string, string[]>;
  estimatedDuration: number;
  completedTools: string[];
  failedTools: string[];
}

export interface PlannedTool {
  id: string;
  name: string;
  args: Record<string, any>;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
  estimatedDuration: number;
  requiresUserInput: boolean;
  dependsOn: string[];
}

export interface PermissionRequirement {
  toolName: string;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
  respondedAt?: string;
  response?: string;
}

export interface Task {
  // ... existing fields ...
  toolPlan?: ToolExecutionPlan;
  permissions?: PermissionRequirement[];
  errors?: TaskError[];
  started_at?: string;
  completed_at?: string;
}

// Enhanced createTask function
export async function createEnhancedTask(data: {
  type: string;
  name: string;
  description?: string;
  source: string;
  requirements?: string;
  owner?: string;
}): Promise<Task> {
  await ensureDir();
  const id = data.id || generateId();
  const now = new Date().toISOString();
  const type = data.type || 'generic';

  const task: Task = {
    id,
    type,
    name: data.name,
    description: data.description,
    owner: data.owner || 'orchestrator',
    locked: data.locked ?? true,
    source: data.source || 'orchestrator',
    status: 'created',
    progress: 0,
    steps: getStepsForType(type),
    permissions: [],
    errors: [],
    logs: [{
      timestamp: now,
      level: 'info',
      message: `[SYSTEM] Task "${data.name}" created. Requirements: ${data.requirements || 'none'}`
    }],
    created_at: now,
    updated_at: now,
  };

  await fs.writeFile(
    path.join(TASKS_DIR, `${id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8'
  );

  return task;
}
```

### File 2: New Task Permission Service

```typescript
// src/brain/taskPermissionService.ts - New file

import { addAgentNotification, updateNotificationStatus, AgentNotification } from './state';
import { getTask, updateTask, Task, PermissionRequirement } from './taskService';

export async function createPermissionNotification(
  taskId: string,
  toolName: string,
  args: Record<string, any>,
  agentId: string,
  agentName: string
): Promise<AgentNotification> {
  const notification = await addAgentNotification(
    agentId,
    agentName,
    generatePermissionMessage(taskId, toolName, args),
    'approval_needed',
    true
  );
  
  // Link notification to task
  const task = await getTask(taskId);
  if (task) {
    await updateTask(taskId, {
      linked_notification_id: notification.id,
      permissions: [
        ...(task.permissions || []),
        {
          toolName,
          permissionLevel: getToolPermissionLevel(toolName),
          status: 'pending',
          requestedAt: new Date().toISOString()
        }
      ]
    });
  }
  
  return notification;
}

export async function handlePermissionDecision(
  taskId: string,
  toolName: string,
  approved: boolean,
  userResponse?: string
): Promise<Task | null> {
  const task = await getTask(taskId);
  if (!task) return null;
  
  // Update the specific permission
  const updatedPermissions = task.permissions?.map(p => {
    if (p.toolName === toolName) {
      return {
        ...p,
        status: approved ? 'approved' : 'denied',
        respondedAt: new Date().toISOString(),
        response: userResponse
      };
    }
    return p;
  }) || [];
  
  // Check if all required permissions are approved
  const allApproved = updatedPermissions.every(p => p.status === 'approved');
  const anyDenied = updatedPermissions.some(p => p.status === 'denied');
  
  let newStatus = task.status;
  if (allApproved) {
    newStatus = 'ready';
  } else if (anyDenied) {
    newStatus = 'failed';
  }
  
  // Add log entry
  const newLog = {
    timestamp: new Date().toISOString(),
    level: approved ? 'info' as const,
    step: toolName,
    message: `Permission ${approved ? 'approved' : 'denied'} for ${toolName}`,
    meta: { userResponse }
  };
  
  const updatedTask = await updateTask(taskId, {
    status: newStatus,
    permissions: updatedPermissions,
    logs: [...task.logs, newLog]
  });
  
  return updatedTask;
}

function generatePermissionMessage(taskId: string, toolName: string, args: any): string {
  return `
🔒 **Permission Required**

**Task:** ${taskId}
**Tool:** ${toolName}

**Arguments:**
${JSON.stringify(args, null, 2).substring(0, 500)}

Please confirm or deny this action.
`.trim();
}

function getToolPermissionLevel(toolName: string): 'safe' | 'major' | 'blocked' {
  // Import from refinedPermissionGuard
  const { classifyTool } = require('./tools/refinedPermissionGuard');
  return classifyTool(toolName);
}
```

### File 3: Update Tool Execution

```typescript
// src/brain/tools/index.ts - Add task tracking

export async function runTool(tool: string, args: any, requester: string = 'orchestrator', agentId?: string) {
  const taskId = args.task_id;
  
  // Check permission with task context
  const { enforcePermissionWithTask } = await import('./refinedPermissionGuard');
  const permissionCheck = await enforcePermissionWithTask(tool, args, agentId, taskId);
  
  if (!permissionCheck.allowed && permissionCheck.requiresApproval) {
    // Create permission notification linked to task
    if (taskId && permissionCheck.permissionRequest) {
      await createPermissionNotification(
        taskId,
        tool,
        args,
        agentId,
        permissionCheck.permissionRequest.agentName
      );
    }
    
    throw new Error(`[PERMISSION_BLOCK] ${permissionCheck.reason}`);
  }
  
  // Execute tool (existing code)
  const result = await executeTool(tool, args, requester, agentId);
  
  // Update task progress
  if (taskId) {
    await updateToolProgress(taskId, tool, result.success ? 'completed' : 'failed', result);
  }
  
  return result;
}
```

---

## Enhanced Task Flow

### Flow Diagram: Complete Task Lifecycle

```
┌────────────────────────────────────────────────────────────────────┐
│                         USER INPUT                                   │
│  "Create an Instagram agent that posts daily updates"             │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                                    │
│  1. Detect Intent: agent_creation                                   │
│  2. Create Task with createEnhancedTask()                           │
│  3. Analyze Required Tools via analyzeRequiredTools()              │
│     - create_agent (safe)                                          │
│     - instagram_dm_sender (major - needs approval)                │
│     - platform_post (major - needs approval)                       │
│  4. Set status: waiting_permission                                  │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                      TASK CREATED                                   │
│  Name: "Create Instagram Agent"                                     │
│  Status: waiting_permission                                         │
│  Tool Plan:                                                         │
│    - create_agent (safe, approved)                                  │
│    - instagram_dm_sender (major, pending)                        │
│    - platform_post (major, pending)                               │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                  NOTIFICATION PANEL                                  │
│  🔒 Permission Required for Task "Create Instagram Agent"           │
│     Tool: instagram_dm_sender                                     │
│     [Approve] [Deny]                                               │
└��───────────────────────────────────────────────────────────────────┘
                                  │
                    user approves via chat or notification
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                       TASK UPDATED                                   │
│  Status: ready → processing                                         │
│  Progress: 0%                                                      │
│  Permissions: all approved                                          │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                    TOOL EXECUTION                                    │
│  1. execute create_agent                                             │
│  2. progress: 33%                                                   │
│  3. execute instagram_dm_sender (after approval)                  │
│  4. progress: 66%                                                   │
│  5. execute platform_post (after approval)                         │
│  6. progress: 100%                                                 │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                      TASK COMPLETED                                 │
│  Status: completed                                                 │
│  Progress: 100%                                                    │
│  All tools executed successfully                                    │
│  Result: { agentId: "agent_xxx", tools: [...]}                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## UI Enhancements

### Task Card - New Sections

```tsx
// 1. Permission Requirements Section
function PermissionRequirements({ permissions, onApprove, onDeny }) {
  return (
    <div className="permission-section">
      <h4>🔒 Required Permissions</h4>
      {permissions.map((perm, i) => (
        <div key={i} className={`permission-item ${perm.status}`}>
          <span className="tool-name">{perm.toolName}</span>
          <span className="permission-level">{perm.permissionLevel}</span>
          <span className="status">{perm.status}</span>
          {perm.status === 'pending' && (
            <div className="actions">
              <button onClick={() => onApprove(perm.toolName)}>Approve</button>
              <button onClick={() => onDeny(perm.toolName)}>Deny</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 2. Tool Execution Plan Section
function ToolPlanSection({ plan, currentTool }) {
  return (
    <div className="tool-plan">
      <h4>🛠️ Execution Plan</h4>
      {plan.tools.map((tool, i) => (
        <div key={i} className={`tool-item ${tool.status} ${i === currentTool ? 'current' : ''}`}>
          <span className="order">{i + 1}</span>
          <span className="name">{tool.name}</span>
          <span className="level">{tool.permissionLevel}</span>
          <StatusIcon status={tool.status} />
        </div>
      ))}
    </div>
  );
}

// 3. Enhanced Progress with Tool Details
function EnhancedProgress({ task }) {
  return (
    <div className="progress-section">
      {task.toolPlan ? (
        <>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <div className="progress-details">
            <span>{task.toolPlan.completedTools.length} / {task.toolPlan.tools.length} tools</span>
            <span>{task.progress}%</span>
          </div>
        </>
      ) : (
        // Fallback to step-based progress
        <StepProgress steps={task.steps} />
      )}
    </div>
  );
}
```

---

## Testing Plan

### Test Categories

1. **Task Creation Tests**
   - Task creates for all meaningful intents
   - Tool analysis generates correct plan
   - Permission requirements are identified

2. **Permission Flow Tests**
   - Permission request creates notification linked to task
   - User approval/denial updates task correctly
   - Task status changes appropriately

3. **Tool Execution Tests**
   - Tool execution updates task progress
   - Failed tools mark task as failed
   - Progress calculates correctly

4. **UI Tests**
   - All tabs show correct task counts
   - Permission buttons work
   - Progress displays correctly

### Test Scenarios

```typescript
// test-task-system.ts

describe('Task System', () => {
  test('should create task for agent creation request', async () => {
    const message = 'Create an Instagram agent';
    const task = await createEnhancedTask({
      type: 'create_agent',
      name: 'Create Instagram Agent',
      source: 'user',
      requirements: message
    });
    
    expect(task).toBeDefined();
    expect(task.status).toBe('waiting_permission');
    expect(task.toolPlan).toBeDefined();
  });
  
  test('should track permission approval in task', async () => {
    const task = await respondToTaskPermission(
      'task_123',
      'instagram_dm_sender',
      true
    );
    
    expect(task.status).toBe('ready');
  });
  
  test('should update progress on tool completion', async () => {
    await updateToolProgress('task_123', 'create_agent', 'completed', { success: true });
    const task = await getTask('task_123');
    
    expect(task.progress).toBeGreaterThan(0);
  });
});
```

---

## Implementation Order

### Phase 1: Core Service (Priority HIGH)
1. Update taskService.ts with new types and functions
2. Create taskPermissionService.ts
3. Test basic task creation

### Phase 2: Integration (Priority HIGH)
1. Update refinedPermissionGuard.ts
2. Integrate with tool execution
3. Test permission flow end-to-end

### Phase 3: Orchestrator (Priority HIGH)
1. Update orchestrator.ts task creation
2. Add tool analysis
3. Test full orchestration

### Phase 4: API & UI (Priority MEDIUM)
1. Update task API routes
2. Enhance task UI
3. Test complete user flow

---

## Summary

This implementation plan creates a comprehensive task management system that:

✅ **Creates tasks for ALL meaningful operations**
✅ **Shows required tools before execution**
✅ **Tracks permissions explicitly**
✅ **Displays clear progress with tool details**
✅ **Links notifications to tasks**
✅ **Provides clear success/failure states**
✅ **Keeps user in control of all agent operations**

The system ensures users always know:
- What the task is trying to do
- What tools are needed
- What permissions are required
- Current progress
- When input is needed
- Success or failure with reasons

---

*Document Version: 1.0*
*Created: April 2026*
*Project: Social Multi Poster Task System Enhancement*