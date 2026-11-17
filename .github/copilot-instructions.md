# GitHub Copilot instructions

Before making any repository change, read the repository-wide instructions in `/AGENTS.md` and the mandatory Vercel deployment policy in `/docs/vercel-deployment-policy.md`. This applies to every code, configuration, workflow, and documentation change—not only deployment-related tasks.

For UI work, also read `/docs/design-system.md`.

Use existing semantic CSS variables and shared components. Do not create a second theme implementation, write global theme variables from feature components, or use arbitrary colors for ordinary UI. Preserve user-selected theme colors, light/dark mode, parent/child consistency, semantic status colors, and all existing application behavior.

Keep code changes, PR creation, PR merging, Preview deployments, and Production deployments separate. Never merge to `main`, trigger/redeploy/promote a Vercel deployment, or change Vercel project deployment settings without the explicit user approval required by `/docs/vercel-deployment-policy.md`. Treat changes to `main` as potentially triggering Production deployment.

Before opening a PR, review both the parent manager and child learning experiences and run the design-system check, TypeScript check, and production build when available.
