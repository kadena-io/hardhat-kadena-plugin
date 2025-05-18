// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title Create2Factory
 * @author Kadena Team
 * @dev A utility contract that deploys other contracts using the CREATE2 opcode
 * @notice Provides functions for deterministic contract deployment with optional sender binding
 */
contract Create2Factory {
  event Deployed(
    address addr,
    bytes32 salt,
    address sender,
    bool boundToSender
  );

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
    emit Deployed(addr, salt, msg.sender, false);
    return addr;
  }

  /**
   * @notice Deploys a contract using CREATE2 with the salt bound to the sender address
   * @dev Combines msg.sender with the userSalt to prevent front-running attacks.
   *      This function is also provided for those who are concerned about address
   *      squatting on new chainweb EVM chains.
   * @param bytecode The contract bytecode to deploy
   * @param userSalt A user-provided salt that will be combined with msg.sender
   * @return The deployed contract address
   * @custom:emits Deployed event with the new contract address, userSalt, sender and boundToSender=true
   */
  function deployBound(
    bytes memory bytecode,
    bytes32 userSalt
  ) public payable returns (address) {
    address addr;
    uint256 value = msg.value;

    bytes32 finalSalt = keccak256(abi.encodePacked(msg.sender, userSalt));

    assembly {
      addr := create2(value, add(bytecode, 0x20), mload(bytecode), finalSalt)
      if iszero(extcodesize(addr)) {
        revert(0, 0)
      }
    }
    emit Deployed(addr, userSalt, msg.sender, true);
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

  /**
   * @notice Calculates the address where a contract will be deployed using deployBound()
   * @dev Combines msg.sender with userSalt similar to deployBound() for address calculation
   * @param bytecode The contract bytecode to deploy
   * @param userSalt A user-provided salt that will be combined with msg.sender
   * @return The address where the contract would be deployed
   */
  function computeAddressBound(
    bytes memory bytecode,
    bytes32 userSalt
  ) public view returns (address) {
    bytes32 finalSalt = keccak256(abi.encodePacked(msg.sender, userSalt));

    bytes32 hash = keccak256(
      abi.encodePacked(
        bytes1(0xff),
        address(this),
        finalSalt,
        keccak256(bytecode)
      )
    );
    return address(uint160(uint(hash)));
  }
}
