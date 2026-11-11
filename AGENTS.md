# AI development instructions

This repository has a shared visual language for the parent manager app and the child learning app.

## Mandatory UI workflow

1. Before changing any UI, read `docs/design-system.md`.
2. Inspect the existing screen and reuse its current components and interaction patterns. Do not redesign unrelated areas.
3. Use the semantic design tokens in `app/globals.css`. Do not introduce page-specific theme palettes or write to global theme CSS variables from feature components.
4. The only runtime owner allowed to update `--primary`, `--primary-foreground`, `--ring`, `--child-accent`, or `--child-accent-foreground` is `components/child-profile-settings.tsx`.
5. Use `bg-primary text-primary-foreground` for primary actions and `bg-primary-container text-primary-container-foreground` for selected surfaces. Keep ordinary surfaces and text neutral.
6. Keep success, warning, error, subject/category, coupon, and game colors semantically separate from the user's theme color.
7. Do not concatenate HEX alpha suffixes to CSS variable strings. Use `color-mix(in srgb, <color> <percentage>%, transparent)` for translucent theme accents.
8. Preserve existing behavior, data ownership, accessibility labels, haptic interactions, and mobile layouts when making visual changes.
9. For changes to the palette or theme logic, preserve the stored user HEX choice and theme mode. Apply contrast adjustments only to the rendered accent; do not overwrite the user's selected value.
10. Run `pnpm check:design-system`, `pnpm exec tsc --noEmit`, and `pnpm build` when feasible. Report any check that could not be run; never claim it passed without evidence.

## Pull request expectations

- State which parent and child screens were visually reviewed.
- Explain any intentional exception to the design system.
- Update `docs/design-system.md` when the shared rules change.
- Never merge or deploy unless the user explicitly requests it.
