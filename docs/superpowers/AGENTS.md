# Design and Plan Records Contract

## Purpose
- Own approved architectural design records and the detailed task-by-task implementation plan.

## Ownership
- `specs/` owns the validated design and decision record.
- `plans/` owns the executable implementation sequence.

## Local Contracts
- A spec must identify scope, architecture, state boundaries, interfaces, persistence, testing, and acceptance criteria.
- A plan must begin with its goal, architecture, tech stack, source spec, and global constraints.
- Plan tasks must state exact files, interfaces, tests, commands, expected red/green outcomes, and commit boundaries.

## Work Guidance
- Keep the design and plan synchronized when approved decisions change.
- Do not use vague implementation instructions where an interface or test can be stated directly.

## Verification
- Search the plan for unresolved placeholder language.
- Cross-check every source subsystem and product requirement against at least one plan task.

## Child DOX Index
- No narrower durable documentation boundary exists yet.
