# Skill: Training Dataset Creator

## Purpose
Transform raw interaction logs and session histories into structured, machine-learnable training datasets.

## Input
- `raw_conversation`: The text dump to be processed.
- `participants`: List of involved agents or users.
- `tags`: Optional metadata (e.g., #teasing, #professional).

## Tool Access
- `code_executor` (was: `sandbox_bridge` for parse_history/extract_tone, and `file_write` for output)
  - Use `operation: "write_file"` to write parsed datasets
  - Use `operation: "run_code"` for processing logic

## Orchestration Steps
1. **Initialize Task**: Create task type `dataset_creation` with a descriptive name.
2. **Conversation Parsing**: Use `code_executor` to parse the raw conversation and separate turns.
3. **Tone Analysis**: For each turn, analyze linguistic style and profile tone.
4. **Structuring**: Format the parsed turns into a training JSON structure (User Prompt → Assistant Response).
5. **Storage**: Use `code_executor` with `operation: "write_file"` to write the final dataset to `/src/data/datasets/{task_id}.json`.
6. **Summary**: Return the number of entries generated and a summary of dominant tones.

## Rules
- **Anti-Silent Rule**: MUST log "Parsing turnover..." and "Analyzing tone..." during processing.
- **Privacy**: Ensure sensitive user identifiers are normalized or masked.
- **Completion**: Task status must be `completed` only after the file is successfully written by `code_executor`.
