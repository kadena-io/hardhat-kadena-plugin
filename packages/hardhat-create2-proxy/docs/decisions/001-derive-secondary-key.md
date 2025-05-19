# ADR: Deterministic Secondary Key Derivation for CREATE2 Proxy Deployment

## Status

Accepted

## Date: 19-05-2025

## Context

In order to ensure **consistent contract addresses across multiple EVM chains** using `CREATE2`, we must control the **deployer address**, since it is a critical part of the formula used by the EVM to derive the final contract address.

Allowing users to deploy with their primary wallet keys can lead to:

- Inconsistent addresses across chains (due to different account nonces or deployment keys).
- Unintended exposure of private keys that are meant for general signing or transaction purposes.

To solve this, we need a method to derive a **secondary key** that is:

- Deterministic (same input = same key)
- Chain-agnostic
- Derived securely by the user (without external key generation tools)
- Not reused for any other purpose

## Decision

We will derive a **secondary deployer key** using the user's existing wallet and a signed message. The message will include a **fixed label and version**, and the signature will be hashed to generate a private key.

### Key Derivation Logic

```ts
export async function deriveSecondaryKey(
  signer: Signer,
  version: number | bigint = BigInt(1),
) {
  const message = `DeployerKey:v1:create2:version:${version}`;
  const signature = await signer.signMessage(message);
  const hash = keccak256(toUtf8Bytes(signature));
  const derivedPrivateKey = '0x' + hash.slice(2, 66);
  const wallet = new Wallet(derivedPrivateKey, signer.provider);

  return {
    publicKey: await wallet.getAddress(),
    privateKey: derivedPrivateKey,
  };
}
```

- The signature ensures only the owner of the original key can generate the deployer key.
- The derived key is **not reused for general signing or transactions**.
- Because no chain-specific data is used, the same deployer address will be generated on all EVM-compatible chains.

## Consequences

### Pros

- **Cross-chain deterministic deployment**: Using `CREATE2` with the same deployer and salt ensures contracts have the same address across chains.
- **Improved security**: By separating deployment from the user's main key, we reduce the risk of key compromise.
- **No need for user to manage extra keys**: Everything is derived securely via the existing wallet provider.

### Cons

- Since the derived key doesn’t have any balance, the user needs to fund the account before using it.

## Alternatives Considered

- **Manual key generation/storage**: Inconvenient and error-prone.
- **Using the main key directly**: Leads to inconsistent deployment addresses across chains.

## Notes

The `version` field allows creating a new key from the original key, giving the user more flexibility, such as deploying separate proxies for each version.
