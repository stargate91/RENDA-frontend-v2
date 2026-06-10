# AGENTS.md

## Communication Style

- Be concise.
- Do not explain obvious code changes.
- Do not summarize diffs unless explicitly asked.
- Avoid verbose reasoning and unnecessary commentary.
- Prefer short status updates over long explanations.
- Assume the user can read the actual code changes.
- Only mention:
  - important architectural decisions
  - breaking changes
  - risks / side effects
  - required manual steps
  - blockers or uncertainties

## Code Changes

- Do not refactor unrelated code.

## Output Format

When finishing a task:

- Keep the response under ~5 lines unless more detail is requested.
- Do not paste large code snippets unless asked.
- Do not explain implementation details already visible in the diff.
- If tests were run, state only:
  - what was tested
  - whether it passed

Good example:
- "Fixed race condition in auth middleware."
- "Added retry handling for failed uploads."
- "Tests passed."

Bad example:
- Multi-paragraph explanation of every edited file and function.