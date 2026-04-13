# Skill: Training Dataset Creator

## Purpose
Transform raw interaction logs and session histories into structured, machine-learnable training datasets.

## Input
- `raw_conversation`: The text dump to be processed.
- `participants`: List of involved agents or users.
- `tags`: Optional metadata (e.g., #teasing, #professional).

## Tool Access
- `sandbox_bridge` (for `parse_history` and `extract_tone`)
- `file_write`
- `append_log`

## Orchestration Steps
1. **Initialize Task**: Create task type `dataset_creation` with a descriptive name.
2. **Conversation Parsing**: Pass `raw_conversation` to `sandbox_bridge:parse_history` to separate turns.
3. **Tone Analysis**: For each turn, use `sandbox_bridge:extract_tone` to profile the linguistic style.
4. **Structuring**: Format the parsed turns into a training JSON structure (User Prompt -> Assistant Response).
5. **Storage**: Write the final dataset to `/src/data/datasets/{task_id}.json`.
6. **Summary**: Return the number of entries generated and a summary of dominant tones.

## Rules
- **Anti-Silent Rule**: MUST log "Parsing turnover..." and "Analyzing tone..." to the task logs.
- **Privacy**: Ensure sensitive user identifiers are normalized or masked.
- **Completion**: Task status must be `completed` only after the file is successfully written.
