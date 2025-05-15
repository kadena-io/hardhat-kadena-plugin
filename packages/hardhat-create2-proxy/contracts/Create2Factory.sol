// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Create2Factory {
  event Deployed(address addr, uint256 salt);

  function deploy(
    bytes memory bytecode,
    uint256 salt
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

  function computeAddress(
    bytes memory bytecode,
    uint256 _salt
  ) public view returns (address) {
    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0xff), address(this), _salt, keccak256(bytecode))
    );
    return address(uint160(uint(hash)));
  }
}
