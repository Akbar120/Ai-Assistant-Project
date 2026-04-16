# Skill: ClawHub Installer

## Description
Installs pre-vetted skills from the ClawHub registry on command. Once installed, a skill is immediately live in the Skills section and auto-activates when relevant triggers are detected.

## Triggers
- Keywords: install skill, clawhub, download skill, add skill, get skill, install from clawhub, setup skill

## 🔐 Tool Access
- `install_skill`

## Execution Steps
1. If no skill name is specified, call `install_skill` with `action: "list"` to show available skills.
2. Present the list clearly to the user: name, description, key.
3. When user specifies a skill to install, call `install_skill` with `skill_name: "skill_key"`.
4. Confirm installation with exact path and immediate availability.
5. Update the agent's skill assignment if requested.

## Hard Rules
- NEVER install a skill without user knowing what it does (show description first).
- NEVER overwrite an existing skill without explicit confirmed intent.
- After installation, ALWAYS confirm it appears in the Skills tab.
