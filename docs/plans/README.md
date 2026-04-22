# Implementation plan archive

Every feature that goes through the full workflow produces an implementation plan in this folder, named `YYYY-MM-DD-<feature-slug>-plan.md`. Plans break a spec into bite-sized TDD tasks, exact file paths, and exact commands. They exist for two reasons:

1. **Executability.** A subagent or a returning contributor can pick a plan up and make forward progress without rebuilding context from scratch.
2. **Archive.** Once a plan is executed, it stays here as a record of what was actually done and in what order. Plans are not re-edited to match the final code — use `git blame` and the PR history for that.

Plans are _not_ the source of truth for how the code works today — they're snapshots of how a specific change was sequenced.
