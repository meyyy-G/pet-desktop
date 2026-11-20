# PET DESKTOP — AI Agent Instructions

## 1. Project Context

PET DESKTOP is a desktop pet application developed with Python.

The project also includes a Web UI for managing:
- Home
- Diary
- Chat
- Calendar
- Tasks
- Focus

Before making changes, read README.md and relevant project files.

Do not assume a feature is already implemented without checking the code.

## 2. Development Rules

- Understand the existing architecture before making changes.
- Preserve existing functionality.
- Do not modify unrelated files.
- Do not redesign existing UI components without permission.
- Do not introduce new features without approval.
- Do not install dependencies without approval.
- Explain proposed changes before implementing them.
- Run relevant tests when possible.
- Never delete files without explicit permission.

## 3. Agency Agents

The project contains the following role definitions:

- Product Manager:
  .agents/skills/product-manager.md

- UX Researcher:
  .agents/skills/design-ux-researcher.md

- Frontend Developer:
  .agents/skills/engineering-frontend-developer.md

These files contain specialized role instructions.

When the user explicitly requests one of these roles,
read the corresponding Markdown file and follow its instructions.

Do not assume these Markdown files are registered Codex Skills.

## 4. Product Design Rules

- Follow the existing PRD and approved designs.
- Preserve the current UI structure unless changes are requested.
- Prioritize usability, consistency, and accessibility.
- Do not invent product requirements.
- Clearly distinguish implemented features from planned features.

## 5. Communication

- Communicate with the user in Chinese.
- Keep technical terminology in English when appropriate.
- Explain important architectural decisions.
- Ask for approval before making major structural changes.