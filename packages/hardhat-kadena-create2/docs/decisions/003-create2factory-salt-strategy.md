# ADR 0003: CREATE2 Factory Salting Strategy

## Status

Accepted

## Date: 19-05-2025

## Context

`CREATE2` allows contracts to be deployed at deterministic addresses based on three inputs: a constant the factory address, the salt, and the initialization code.The EVM addes the constant 0xFF to the beginning of the address. This enables predictable contract addresses, which is useful for many deployment patterns.

When designing a factory contract for deterministic deployments (`CREATE2Factory`), we need to decide how to generate or handle the salt value passed to the `CREATE2` opcode.

## Decision

We decided to use a **general factory that simply passes the salt input directly to `CREATE2`**, without mixing in the deployer’s address (`msg.sender`) or other data.

This keeps the contract simple and consistent with EVM developers’ expectations. Additionally, since each team or developer deploys their own `CREATE2Factory` instance, this naturally creates a namespace for salt values, reducing collision risks.

## Consequences

### Pros

- **Simplicity:** The factory is easier to audit and reason about. It behaves exactly as EVM developers expect for `CREATE2`.
- **Namespace separation:** Because each user deploys their own factory, the deployer address is inherently unique per user, serving as a natural namespace.
- **Flexibility:** Users control their salt values and deployment process fully without hidden transformations.
- **Lower complexity:** Avoids embedding caller info in salts, which could complicate tooling and developer experience.

### Cons

- **Potential collision risk:** Since the salt is user-controlled and does not incorporate caller address, theoretically two different users can send same inputs to the factory that leads to same address.

- **Less granular control:** Not embedding `msg.sender` means the contract can’t enforce address differentiation on salt derivation level, relying instead on user-level factory deployment for separation.

## Alternatives Considered

### Using `msg.sender` in Salt Derivation (Create2Factory Contract)

We initially considered a design where the salt is composed by combining the caller’s address (`msg.sender`) with a user-provided salt, like this example contract:

```solidity
pragma solidity ^0.8.0;

contract Create2Factory {
  event Deployed(address addr, uint256 salt);

  function deploy(
    bytes memory bytecode,
    uint96 userSalt
  ) public payable returns (address) {
    address addr;
    uint256 value = msg.value;
    uint256 packed = (uint256(uint160(msg.sender)) << 96) | userSalt;
    assembly {
      addr := create2(value, add(bytecode, 0x20), mload(bytecode), packed)
      if iszero(extcodesize(addr)) {
        revert(0, 0)
      }
    }
    emit Deployed(addr, packed);
    return addr;
  }
}
```

**Rationale for rejecting this alternative:**

- While this approach adds caller-specific data to the salt, increasing address differentiation, it is **less familiar to EVM developers**, who expect the salt to be fully controlled by the deployer.
- Since each team or developer deploys their own factory contract, **namespacing is already provided by the deployer address** at the `CREATE2` level, making embedding `msg.sender` in the salt redundant.
- This complexity could create unexpected behaviors or reduce clarity in tooling and deployment scripts.
- We will monitor if this simplification leads to any undesired issues such as accidental contract collisions or malicious reuse.

## Notes

We must keep monitoring for possible edge cases caused by the absence of caller info in the salt, such as multiple unrelated users deploying contracts with the same salt and factory bytecode. If needed, future versions of the factory contract can revisit salt composition to mitigate this.
