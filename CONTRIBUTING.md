# Contributing

- Keep package scope limited to AGG read-only action-intent/evidence binding.
- Preserve the versioned Workflow Port v1 allowlist; expand only with a reviewed contract and negative tests.
- Never add database handles, SQL, writes, transactions, network, shell, approval, trust-root custody, or dispatch authority.
- Run `npm ci`, `npm run check`, `npm run pack:check`, and `npm run test:packed-consumer` before proposing changes.
- Keep source manifest hashes current with `npm run check:manifest` after intended source changes.
