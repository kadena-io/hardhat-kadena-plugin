import { DeployUsingCreate2 } from './type';
/**
 * Deploy a contract on all configured chainweb chains using CREATE2.
 * This ensures the contract is deployed to the same address on all chains.
 *
 * @param name - The name of the contract to deploy
 * @param signer - Optional signer for deployment (defaults to first account)
 * @param factoryOptions - Optional additional options for the contract factory
 * @param constructorArgs - Arguments to pass to the contract constructor
 * @param overrides - Optional transaction overrides for the deployment
 * @param salt - The salt to use for the CREATE2 deployment
 * @param create2Factory - Optional custom CREATE2 factory address.
 * Must implement:
 * - function deploy(bytes memory bytecode, bytes32 salt) public payable returns (address)
 * - function computeAddress(bytes memory bytecode, bytes32 salt) public view returns (address)
 * @returns Object containing deployment information for each chain
 */
export declare const deployUsingCreate2: DeployUsingCreate2;
//# sourceMappingURL=deployContracts.d.ts.map