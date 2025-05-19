# ADR: User-Owned CREATE2 Proxy Deployment Strategy

## Status

Accepted

## Date: 19-05-2025

## Context

Initially, we considered to deploy a single, shared `create2Proxy` contract on each chain, centrally deployed and managed by Kadena. This would allow all users to utilize the same proxy address for deterministic contract deployments via `CREATE2`.

However, we reconsidered this model in favor of letting **each user deploy their own instance of the `create2Proxy`**. This decision was driven by architectural and strategic considerations:

- We want to **separate infrastructure and core protocol responsibilities** from user-level operations.
- It enables **better modularity**, avoids unnecessary coupling with Kadena-managed infrastructure, and improves decentralization.
- Deploying user-specific proxies increases **entropy** in deployed contract addresses, reducing address collision risks and improving uniqueness in multi-user deployments.

## Decision

Each end user is responsible for deploying their own `create2Proxy` using their derived deployer key. Kadena does not deploy or manage this contract globally.

This approach preserves:

- Full user sovereignty and separation from Kadena core infrastructure.
- Compatibility with deterministic deployments using `CREATE2`.

The deployment flow involves:

1. Deriving a secondary deployer key (see [ADR 0001](./0001-secondary-key-derive.md)).
2. Funding the derived account.
3. Deploying the `create2Proxy` contract from that account.

## Consequences

### Pros

- **Better separation of concerns**: Keeps deployment infrastructure out of Kadena’s core protocol responsibilities.
- **More decentralized**: Each user controls and deploys their own proxy.
- **Increased address randomness**: Because each proxy is deployed from a different address, the resulting deployed contracts have more entropy.
- **Less coordination overhead**: No need to synchronize proxy deployments across chains or environments.
- **Easier upgradeability or customization**: Users can swap or upgrade their own proxy logic independently if needed.

### Cons

- **Slightly higher onboarding complexity**: Each user must fund and deploy their own proxy.
- **Increased on-chain cost per user**: Every user must pay for an additional deployment transaction.
- **Harder to debug user issues**: Since each proxy may be different, it adds variability that needs to be considered in support and tooling.

## Alternatives Considered

- **Centralized proxy deployment by Kadena**: Easier setup, but tightly couples user contracts with Kadena-managed infrastructure and reduces user-level entropy.
