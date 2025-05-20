# ADR: User-Owned CREATE2 Factory Deployment Strategy

## Status

Accepted

## Date: 19-05-2025

## Context

Initially, we considered to deploy a single, shared `create2Factory` contract on each chain, centrally deployed and managed by Kadena. This would allow all users to utilize the same factory address for deterministic contract deployments via `CREATE2`.

However, we reconsidered this model in favor of letting **each user deploy their own instance of the `create2Factory`**. This decision was driven by architectural and strategic considerations:

- We want to **separate infrastructure and core protocol responsibilities** from user-level operations.
- It enables **better modularity**, avoids unnecessary coupling with Kadena-managed infrastructure, and improves decentralization.
- Deploying user-specific proxies increases **entropy** in deployed contract addresses, reducing address collision risks and improving uniqueness in multi-user deployments.

## Decision

Each end user is responsible for deploying their own `create2Factory` using their derived deployer key. Kadena does not deploy or manage this contract globally.

This approach preserves:

- Full user sovereignty and separation from Kadena core infrastructure.
- Compatibility with deterministic deployments using `CREATE2`.

The deployment flow involves:

1. Deriving a secondary deployer key (see [ADR 0001](./0001-secondary-key-derive.md)).
2. Funding the derived account.
3. Deploying the `create2Factory` contract from that account.

## Consequences

### Pros

- **Better separation of concerns**: Keeps deployment infrastructure out of Kadena’s core protocol responsibilities.
- **More decentralized**: Each user controls and deploys their own factory.
- **Increased address randomness**: Because each factory is deployed from a different address, the resulting deployed contracts have more entropy.
- **Less coordination overhead**: No need to synchronize factory deployments across chains or environments.
- **Easier upgradeability or customization**: Users can swap or upgrade their own factory logic independently if needed.

### Cons

- **Slightly higher onboarding complexity**: Each user must fund and deploy their own factory.
- **Increased on-chain cost per user**: Every user must pay for an additional deployment transaction.
- **Harder to debug user issues**: Since each factory may be different, it adds variability that needs to be considered in support and tooling.

## Alternatives Considered

- **Centralized factory deployment by Kadena**: Easier setup, but tightly couples user contracts with Kadena-managed infrastructure and reduces user-level entropy.
