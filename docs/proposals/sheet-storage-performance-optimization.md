# Sheet Storage Performance Optimization

> Status: Proposal
>
> This document records the observed performance risks and the agreed
> direction for future optimization. It does not describe an implemented
> runtime change.

## Context

OpenExcel stores Sheet content in sparse `SheetChunk` records. The current
default chunk geometry is:

```text
256 rows × 256 columns
```

Normal Web edits are sparse mutations and are persisted through the shared
Sheet command path. The Server owns persistence, revision checks, and
idempotency. The Web editor remains responsible for formula calculation.

The current synchronization contract is documented in
[`docs/current/spreadsheet-sync.md`](../current/spreadsheet-sync.md).

## What is already solved

The current architecture already addresses the main cost of ordinary local
editing:

```text
edit one cell
→ locate one chunk
→ update one chunk
→ increment the Sheet revision
```

The normal human workflow usually changes one cell or a small nearby region at
a time. It does not require loading or serializing the complete Sheet.

The following are already part of the current architecture:

- sparse Web mutations instead of complete snapshot replacement for ordinary
  edits;
- `SheetChunk` persistence for SQLite and PostgreSQL;
- revision/CAS concurrency control;
- idempotent mutation receipts;
- bounded change summaries and previews;
- no fixed cell, operation, or chunk limit for normal spreadsheet actions;
- no formula recalculation in the normal Server write transaction.

## Problem statement

The remaining performance risk is concentrated in broad mutations, not normal
single-cell editing.

Some mutation paths currently behave conceptually like this:

```text
read all affected chunks
→ merge them into one temporary cell map
→ apply the mutation
→ sort or rebuild the combined data
→ split it back into chunks
→ write the chunks
```

This creates a working set proportional to all affected data instead of one
chunk. It can cause:

- high peak memory usage;
- longer SQLite write-lock duration;
- longer PostgreSQL transaction duration;
- lower throughput when multiple requests are active;
- broad mutations becoming slower than the old full-snapshot path;
- large, sparse operations producing unnecessary application-level work.

The benchmark currently in the workspace demonstrated this risk with an
artificial broad workload of one million cells and uniformly distributed
changes:

```text
1% changed:
  old full-data baseline: approximately 2.55s
  current chunk path:     approximately 5.12s
  observed RSS increase:  approximately 223MB
```

This workload is intentionally adversarial. It should not be treated as a
representative human-edit benchmark, but it exposes the memory and tail
latency risk for AI tools, imports, and extreme spreadsheet operations.

## Workload priorities

Performance work should be evaluated against these workload classes:

### Priority A: ordinary human editing

- one-cell edits;
- a few adjacent cell edits;
- local paste;
- local drag-fill.

The current `256×256` geometry is expected to be adequate for this class. The
main requirement is that a single-cell mutation only loads and rewrites its
own chunk.

### Priority B: AI and service-generated mutations

- broad `writeCells` operations;
- sparse edits distributed across a large Sheet;
- row or column fills;
- large clear operations;
- import, recovery, and restore workflows.

These operations may touch many chunks and must keep memory bounded even when
they are large. They must not be made impossible by a fixed spreadsheet-size
limit.

### Priority C: extreme interactive operations

- very large paste operations;
- full-row or full-column formatting;
- large drag-fill operations;
- clearing or replacing a very large used range;
- concurrent edits to the same Sheet.

These operations require predictable p95/p99 latency and bounded resource use,
even when their total work remains large.

## Decision: do not change chunk geometry first

A row-band layout such as `1024 rows × actual columns` is attractive for tall,
narrow tables, but it is not a safe default for frequent single-cell edits.
A single-cell update would rewrite a much larger payload. Conversely, making
chunks very small increases the number of chunks and the index/query overhead.

Therefore the first optimization must fix the mutation execution path while
keeping the current `256×256` geometry.

Chunk geometry should only be changed after measuring single-cell, local-range,
and broad-mutation workloads. Candidate geometries such as `128×64` or `64×64`
are benchmark candidates, not current requirements.

## Proposed implementation direction

### 1. Process mutations by chunk without building a global Sheet map

The target flow is:

```text
validate the mutation
→ group affected operations by chunk
→ open one database transaction
→ read one affected chunk
→ apply the operations for that chunk in original order
→ serialize and write that chunk
→ continue with the next chunk
→ update the Sheet revision once
→ save the receipt
→ commit the transaction
```

The implementation must preserve operation ordering. If two operations overlap,
the later operation must still overwrite the earlier operation within every
affected chunk.

The transaction remains one logical mutation. Processing chunks one at a time
does not mean opening one transaction per chunk.

### 2. Keep the working set bounded

The mutation path must not:

- merge all affected chunks into one full temporary `celldata` object;
- build a full-Sheet Map for a local or broad mutation;
- sort all Sheet cells merely to save changed chunks;
- create empty cells for a clear operation.

The intended memory profile is approximately:

```text
one chunk payload + mutation index + transaction overhead
```

rather than:

```text
all affected chunk payloads × multiple temporary copies
```

### 3. Preserve database portability

The logical behavior must remain identical for SQLite and PostgreSQL:

- SQLite continues to use the application-owned write serialization;
- PostgreSQL continues to use database transactions and revision CAS;
- chunk payloads remain portable sparse JSON unless a future measured result
  justifies another format;
- no PostgreSQL-only storage feature is required for the first optimization.

### 4. Keep normal user operations unrestricted

Do not introduce fixed limits such as:

```text
maximum cells per mutation
maximum operations per mutation
maximum affected chunks
```

Resource protection belongs in the execution strategy, transaction handling,
transport protection, and special background-task scheduling. A normal user
must still be able to clear, paste, fill, or replace a large range.

## Future chunk geometry evaluation

After the execution path is corrected, benchmark the following shapes:

```text
10,000 rows × 10 columns
10,000 rows × 100 columns
10,000 rows × 1,000 columns
1,000 rows × 10,000 columns
```

Compare at least:

```text
256×256
128×64
64×64
```

Measure:

- single-cell p50, p95, and p99 latency;
- local row and column edits;
- local paste and drag-fill;
- uniformly distributed 1%, 10%, and 50% changes;
- large clear operations;
- peak RSS;
- SQLite write-lock duration;
- PostgreSQL transaction duration and concurrent throughput;
- number of chunk reads and writes;
- serialized payload size.

If fixed geometry cannot serve both narrow and wide sheets, a later design may
use variable rectangular chunks selected by payload size. Repartitioning must
occur during import, expansion, or background maintenance, not on every
single-cell edit.

## Testing policy

Performance benchmarks are optional and must not run as part of the default CI
or the full unit-test command.

Functional tests remain responsible for:

- single-cell mutation correctness;
- cross-chunk mutation correctness;
- operation ordering;
- clear and unmerge behavior;
- revision conflict handling;
- idempotent replay;
- SQLite and PostgreSQL transaction behavior.

Optional benchmarks are responsible for:

- ordinary sequential single-cell editing;
- bursty single-cell editing;
- local contiguous edits;
- broad AI-style mutations;
- large clear and fill operations;
- SQLite and PostgreSQL p95/p99 latency;
- throughput, lock time, and peak memory.

The artificial uniformly distributed workload is useful as a stress test, but
must not be used as the only basis for selecting the default chunk geometry.

## Non-goals

This proposal does not include:

- a backend Excel formula engine;
- per-cell database rows;
- an append-only cell delta log with background compaction;
- a storage-layer rewrite before the bounded mutation path is measured;
- fixed user-visible limits on normal spreadsheet operations;
- a second runtime fallback to the removed full Sheet storage model.

## Acceptance criteria

The first implementation phase is considered successful when:

1. A single-cell edit reads and rewrites only its containing chunk.
2. A multi-chunk mutation does not construct a combined full affected-sheet Map.
3. Operation ordering and revision/idempotency behavior remain unchanged.
4. Memory usage is bounded by the largest active chunk plus normal request and
   transaction overhead.
5. SQLite and PostgreSQL use the same logical mutation behavior.
6. Broad AI and extreme spreadsheet operations remain valid without fixed
   cell/chunk limits.
7. Benchmarks report p50, p95, p99, throughput, lock time, and peak RSS before
   any chunk-geometry change is selected.
