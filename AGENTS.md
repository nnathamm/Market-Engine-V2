# Repository delivery rules

This repository is the GitHub source of truth for the Signal Control website.

For every user-requested code or interface change, complete the full delivery workflow unless the user explicitly asks for local-only work or says not to publish:

1. Preserve all unrelated and pre-existing uncommitted files.
2. Run the relevant validation, including `npm run lint` and `npm test` for application changes.
3. Stage only the files that belong to the current request.
4. Commit the validated change with a concise, descriptive message.
5. Push the commit to `origin`. Use `main` unless the user requests a branch or pull-request workflow.
6. For changes that affect the running website, publish the exact same committed source through the existing Sites project in `.openai/hosting.json`.
7. Verify that GitHub contains the local commit and that any required Sites deployment succeeds.

Never leave completed code changes only on the local machine without clearly reporting a push or deployment blocker. Never commit credentials, local environment files, generated secrets, or unrelated user work.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
