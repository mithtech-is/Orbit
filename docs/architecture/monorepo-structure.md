# Monorepo Structure

```text
apps/
  backend-medusa/
  web-dashboard/
  mobile-field-sales/
  desktop-operations/
packages/
  api-client/
  shared-types/
  validation/
  ui/
  config/
  maps-provider/
  sync-engine/
  event-contracts/
docs/
infra/
  docker/
  github-actions/
  deployment/
scripts/
```

`packages/shared-types` owns cross-app domain types. `packages/validation` owns schemas and permission helpers. `packages/event-contracts` owns event names and payload shapes. `packages/maps-provider` isolates route, geocode and distance-provider behaviour. `packages/sync-engine` owns device-side mutation queue primitives and conflict classifications. `packages/api-client` consumes validation/shared types and provides typed API calls for all clients.

Applications may import packages but packages must not import application code.
