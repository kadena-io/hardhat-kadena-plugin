// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/access/AccessControl.sol';

/**
 * @title PayableContract
 * @dev A simple contract with a payable constructor to test Create2Factory
 */
contract PayableContract is AccessControl {
  uint256 public constructorValue;

  /**
   * @dev Initializes the contract with the provided admin address
   * and stores the amount of native token sent during deployment
   * @param admin The address to be granted the DEFAULT_ADMIN_ROLE
   */
  constructor(address admin) payable {
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    constructorValue = msg.value;
  }

  /**
   * @dev Returns the contract's current balance
   */
  function getBalance() public view returns (uint256) {
    return address(this).balance;
  }

  /**
   * @dev Withdraws funds from the contract
   * @param amount The amount to withdraw
   */
  function withdraw(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(amount <= address(this).balance, 'Insufficient balance');
    payable(msg.sender).transfer(amount);
  }
}
