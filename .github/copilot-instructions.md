# GitHub Copilot instructions

Follow the repository-wide instructions in `/AGENTS.md` and the visual standards in `/docs/design-system.md` for every UI task.

Use existing semantic CSS variables and shared components. Do not create a second theme implementation, write global theme variables from feature components, or use arbitrary colors for ordinary UI. Preserve user-selected theme colors, light/dark mode, parent/child consistency, semantic status colors, and all existing application behavior.

Before opening a PR, review both the parent manager and child learning experiences and run the design-system check, TypeScript check, and production build when available.
