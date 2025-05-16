// SPDX-License-Identifier: MIT
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

  function computeAddress(
    bytes memory bytecode,
    uint96 userSalt
  ) public view returns (address) {
    uint256 packed = (uint256(uint160(msg.sender)) << 96) | userSalt;
    bytes32 salt = bytes32(packed);
    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
    );
    return address(uint160(uint(hash)));
  }
}
