# Skill: Self Improvement

## Description
This skill enables the agent to engage in a structured self-improvement cycle. The agent first analyzes its current operational state, existing knowledge base (stored in Markdown files), and performance metrics. It then generates a detailed plan, identifies areas for optimization, and proposes specific improvements, which may include new functions, custom tools, or structural changes to existing Markdown files. All proposed improvements are presented to the user in a dedicated "Improvement" review section. The agent will not apply any changes until the user provides explicit, affirmative confirmation. Upon confirmation, the agent executes the necessary modifications, updating the specified Markdown files and integrating new capabilities into its operational framework.

## Scheduling (For Autonomous Agents)
* **Self-Audit**: Perform a comprehensive system self-audit once every **12 hours**.
* **Verification**: Check your recent memory for `[SELF_AUDIT_COMPLETE]`. If more than 12 hours have passed since the last entry, trigger a new improvement cycle.

## Triggers
* "How can I make you better?"
* "Improve your capabilities."
* "Optimize your performance."
* "Analyze my workflow and suggest improvements."
* "Self-improve using my documents."
* "What changes should I make to my knowledge base?"

## 🔐 Tool Access
* **`read_file(file_path: str)`:** Allows the agent to read the content of existing Markdown files for analysis.
* **`write_file(file_path: str, content: str)`:** Allows the agent to write or overwrite content in specified Markdown files (only after user confirmation).
* **`define_tool(tool_name: str, description: str, code_snippet: str)`:** Allows the agent to propose and define new custom tools or functions for use.
* **`improvement_propose(title: str, what: str, why: str, files: list, patch: str)`:** Mandatory step for proposing structural changes. This sends your proposal to the dedicated "Improvements" tab for user review and one-click application.
* **`reasoning_engine(prompt: str)`:** Internal tool used for structured thinking, planning, and identifying improvement vectors.

## Execution Steps
1. **Analysis Phase:** The agent uses `reasoning_engine` and `read_file` to analyze the current context, the user's goals, and the content of relevant Markdown files.
2. **Improvement Generation:** The agent drafts a detailed improvement proposal. This proposal must include:
    *   A clear statement of the problem being solved.
    *   The proposed solution (e.g., a new function definition, a structural change, or a code block).
    *   The specific Markdown file(s) that will be affected.
3. **User Presentation:** The agent presents the entire proposal to the user, clearly separating the analysis, the proposed changes, and the required action. The agent must explicitly ask for confirmation before proceeding.
4. **User Confirmation:** The agent pauses execution and awaits explicit user confirmation (e.g., "Yes, apply these changes," or "Confirm improvement").
5. **Application Phase (If Confirmed):** If the user confirms the improvement:
    *   The agent uses `define_tool` (if necessary) to register new tools.
    *   The agent uses `write_file` to apply the necessary modifications to the specified Markdown files.
    *   The agent summarizes the changes made and confirms the successful update of its knowledge base.
6. **Failure/Rejection:** If the user rejects the proposal, the agent must explain why the changes were not applied and ask for further clarification or alternative instructions.

## Hard Rules
* **User Consent is Mandatory:** The agent MUST NOT execute any `write_file` or `define_tool` action without explicit, affirmative confirmation from the user.
* **Scope Limitation:** The agent must clearly define the scope of the proposed improvement, specifying exactly which files and which sections will be modified.
* **Non-Destructive Drafting:** During the planning phase, the agent must maintain a complete record of the original file contents to allow for immediate rollback or comparison if the user requests it.
* **Transparency:** The agent must always explain *why* a change is beneficial, linking the proposed improvement directly back to the user's stated goals or observed deficiencies.