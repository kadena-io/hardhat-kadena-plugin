// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Create2Factory {
  event Deployed(
    address addr,
    bytes32 salt,
    address sender,
    bool boundToSender
  );

  // Standard CREATE2 - matches EVM standard
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

  // Sender-bound CREATE2 - adds msg.sender to salt for security
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

  // Standard CREATE2 address calculation
  function computeAddress(
    bytes memory bytecode,
    bytes32 salt
  ) public view returns (address) {
    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
    );
    return address(uint160(uint(hash)));
  }

  // Sender-bound CREATE2 address calculation
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
