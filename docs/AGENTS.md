# Documentation Contract

## Purpose
- Own durable project documentation that explains decisions, contracts, plans, and release operation.

## Ownership
- `docs/superpowers/specs/` owns approved design specifications.
- `docs/superpowers/plans/` owns executable implementation plans.
- `implementation-status.md` owns the audited record of what exists versus what the product spec
  requires, including the starting-point audit and the current phase ledger.
- Root `AGENTS.md` owns project-wide rules; this file owns documentation-specific rules.

## Local Contracts
- Documentation must describe current behavior and decisions, not speculative history.
- Specifications define intent and architecture; plans define executable task order.
- Paths, interfaces, commands, and acceptance criteria must be concrete.
- When source structure or workflow changes, update the nearest relevant DOX file and affected index.

## Work Guidance
- Use concise headings, direct bullets, and code blocks for executable commands or interfaces.
- Keep the product spec as the source of product requirements; do not silently rewrite it.
- Mark decisions explicitly when the product spec left them configurable.

## Verification
- Review documentation for stale paths, unresolved placeholders, contradictory interfaces, and missing phase coverage.
- Verify every plan command matches the project package scripts or documented shell tools.

## Child DOX Index
- `superpowers/AGENTS.md` — design specifications and implementation plans.
