# Tool Authoring Rules

> Status: Rule

See [Tool System Architecture](../architecture/tools/README.md) and the [Tool Authoring Guide](../architecture/tools/authoring.md) for the detailed workflow. The following boundaries are mandatory:

1. Decide whether the capability belongs to the Core contract or a concrete Server executor.
2. Define the canonical name, input, output, and description in `packages/core/src/tools/excelToolContract.ts`.
3. Implement the executor and register its manifest in the owning Server module's `tools/` directory.
4. The Server owns workspace/resource authorization, Prisma, mutations, and result previews.
5. The Agent only provides generic adaptation; it must not contain Excel database logic.
6. Validate tool input, execution context, and output with schemas.
7. Reuse the existing SheetCommand or Chart mutation service for writes and preserve `mutationId` idempotency.
8. Add co-located tests for schemas, execution boundaries, errors, replay, and result shapes.
