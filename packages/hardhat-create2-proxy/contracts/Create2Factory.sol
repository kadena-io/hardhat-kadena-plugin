// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title Create2Factory
 * @author Kadena Team
 * @dev A utility contract that deploys other contracts using the CREATE2 opcode
 * @notice Provides functions for deterministic contract deployment with optional sender binding
 */
contract Create2Factory {
  event Deployed(address addr, bytes32 salt);

  /**
   * @notice Deploys a contract using the CREATE2 opcode with the specified bytecode and salt
   * @dev Uses standard CREATE2 deployment with no sender binding
   * @param bytecode The contract bytecode to deploy
   * @param salt A 32-byte value used to create a deterministic address
   * @return The deployed contract address
   * @custom:emits Deployed event with the new contract address, salt, sender and boundToSender=false
   */
  function deploy(
    bytes memory bytecode,
    bytes32 salt
  ) public payable returns (address) {
    address addr;
    uint256 value = msg.value;

    assembly {
      addr := create2(value, add(bytecode, 0x20), mload(bytecode), salt)
      if iszero(extcodesize(addr)) {
        revert(0, 0)
      }
    }
    emit Deployed(addr, salt);
    return addr;
  }

  /**
   * @notice Calculates the address where a contract will be deployed using deploy()
   * @dev Follows the CREATE2 address calculation formula: keccak256(0xff ++ deployerAddress ++ salt ++ keccak256(bytecode))[12:]
   * @param bytecode The contract bytecode to deploy
   * @param salt A 32-byte value used to create a deterministic address
   * @return The address where the contract would be deployed
   */
  function computeAddress(
    bytes memory bytecode,
    bytes32 salt
  ) public view returns (address) {
    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
    );
    return address(uint160(uint(hash)));
  }
}
