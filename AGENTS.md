# FieldSales Implementation Rules

- Treat `docs/00-research-alignment-and-implementation-contract.md` as the local product contract.
- Preserve tenant isolation in every business model and API.
- Products, inventory, sales orders, and expense claims live in ERPNext (system of record). The Orbit backend syncs through the ERP provider — do not stand up parallel commerce stores.
- Use provider interfaces for maps, routing, object storage and push notifications.
- Location tracking requires explicit consent and an active work session.
- Add or update tests before implementing domain behaviour.
- Update `docs/engineering/implementation-progress.md` after each implementation phase.
