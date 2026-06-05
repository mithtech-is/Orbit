# FieldSales Implementation Rules

- Treat `docs/00-research-alignment-and-implementation-contract.md` as the local product contract.
- Preserve tenant isolation in every business model and API.
- Keep Medusa commerce responsibilities in Medusa modules; do not duplicate products, inventory or orders outside Medusa.
- Use provider interfaces for maps, routing, object storage and push notifications.
- Location tracking requires explicit consent and an active work session.
- Add or update tests before implementing domain behaviour.
- Update `docs/engineering/implementation-progress.md` after each implementation phase.
