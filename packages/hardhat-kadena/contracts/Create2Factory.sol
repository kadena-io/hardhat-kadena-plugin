// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title Create2Factory
 * @dev Factory contract for deterministic deployment using CREATE2
 * Inspired by OpenZeppelin's CREATE2 utility but implemented as a standalone contract
 */
contract Create2Factory {
  event Deployed(address indexed deployment, bytes32 indexed salt);

  /**
   * @dev Deploys a contract using CREATE2
   * @param salt The salt value to use for address calculation
   * @param initcode The contract initcode to deploy
   * @return deployment The address of the deployed contract
   */
  function deploy(
    bytes32 salt,
    bytes memory initcode
  ) external returns (address deployment) {
    require(initcode.length != 0, 'Create2Factory: initcode length is zero');
    address expectedAddress = computeAddress(salt, initcode);

    assembly {
      deployment := create2(0, add(initcode, 0x20), mload(initcode), salt)
    }

    require(deployment != address(0), 'Create2Factory: deployment failed');
    require(deployment == expectedAddress, 'Create2Factory: address mismatch');

    emit Deployed(deployment, salt);
    return deployment;
  }

  /**
   * @dev Computes the address where a contract will be deployed using CREATE2
   * @param salt The salt value to use for address calculation
   * @param initcode The contract initcode to deploy
   * @return The computed address
   */
  function computeAddress(
    bytes32 salt,
    bytes memory initcode
  ) public view returns (address) {
    return computeAddress(salt, keccak256(initcode));
  }

  /**
   * @dev Computes the address where a contract will be deployed using CREATE2
   * @param salt The salt value to use for address calculation
   * @param bytecodeHash The hash of the contract initcode
   * @return The computed address
   */
  function computeAddress(
    bytes32 salt,
    bytes32 bytecodeHash
  ) public view returns (address) {
    return
      address(
        uint160(
          uint256(
            keccak256(
              abi.encodePacked(hex'ff', address(this), salt, bytecodeHash)
            )
          )
        )
      );
  }

  /**
   * @dev Returns true if a contract is deployed at a given address
   * @param contractAddress The address to check
   * @return True if there is a contract deployed, false otherwise
   */
  function isDeployed(address contractAddress) public view returns (bool) {
    return contractAddress.code.length > 0;
  }
}
