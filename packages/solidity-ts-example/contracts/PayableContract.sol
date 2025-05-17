// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title PayableContract
 * @dev A simple contract with a payable constructor to test Create2Factory
 */
contract PayableContract {
  address public owner;
  uint256 public constructorValue;

  /**
   * @dev Initializes the contract with the sender as owner
   * and stores the amount of native token sent during deployment
   */
  constructor() payable {
    owner = msg.sender;
    constructorValue = msg.value;
  }

  /**
   * @dev Returns the contract's current balance
   */
  function getBalance() public view returns (uint256) {
    return address(this).balance;
  }
}
