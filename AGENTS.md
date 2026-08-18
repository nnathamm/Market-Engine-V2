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
