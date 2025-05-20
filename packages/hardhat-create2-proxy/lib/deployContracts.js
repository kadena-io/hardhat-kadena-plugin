"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployUsingCreate2 = void 0;
const hardhat_chainweb_1 = require("@kadena/hardhat-chainweb");
const hardhat_1 = __importDefault(require("hardhat"));
const deployCreate2Factory_1 = require("./deployCreate2Factory");
const networkStem = (0, hardhat_chainweb_1.getNetworkStem)(hardhat_1.default.config.defaultChainweb);
const { ethers, chainweb } = hardhat_1.default;
/**
 * Checks if a contract is deployed at the specified address.
 *
 * @param address - The address to check for contract deployment
 * @returns A promise that resolves to true if a contract exists at the address, false otherwise
 */
function isContractDeployed(address) {
    return ethers.provider.getCode(address).then((code) => code !== '0x');
}
/**
 * Creates salt values for CREATE2 deployment with optional sender binding.
 *
 * @param sender - The address of the deploying account
 * @param userSalt - The user-provided salt string
 * @returns A tuple containing [saltBytes for ethers.getCreate2Address, userSaltBytes32 for contract call]
 */
function convertToByte(userSalt) {
    const userSaltBytes32 = ethers.id(userSalt);
    return ethers.getBytes(userSaltBytes32);
}
/**
 * Deploys a contract using standard CREATE2 functionality.
 *
 * @param contractBytecode - The compiled bytecode of the contract to deploy
 * @param signer - The signer that will deploy the contract
 * @param overrides - Optional transaction overrides for the deployment
 * @param salt - The salt to use for the CREATE2 deployment
 * @param create2Factory - Optional custom CREATE2 factory address.
 * Must implement:
 * - function deploy(bytes memory bytecode, bytes32 salt) public payable returns (address)
 * - function computeAddress(bytes memory bytecode, bytes32 salt) public view returns (address)
 * @returns The deployed contract address
 **/
async function deployContract({ contractBytecode, signer, overrides, salt, create2Factory, }) {
    const create2FactoryAddress = create2Factory !== null && create2Factory !== void 0 ? create2Factory : (await (0, deployCreate2Factory_1.getCreate2FactoryAddress)());
    const CREATE2Factory = await hardhat_1.default.ethers.getContractFactory(deployCreate2Factory_1.create2Artifacts.abi, deployCreate2Factory_1.create2Artifacts.bin, signer);
    const create2 = CREATE2Factory.attach(create2FactoryAddress);
    // Standard CREATE2 - don't include sender in salt
    const saltBytes = convertToByte(salt);
    const bytecodeHash = ethers.keccak256(contractBytecode);
    const predictedAddress = ethers.getCreate2Address(create2FactoryAddress, saltBytes, bytecodeHash);
    const computedAddress = await create2.computeAddress(contractBytecode, saltBytes);
    if (computedAddress !== predictedAddress) {
        console.log(`ADDRESS MISMATCH: computed address (${computedAddress}) != predicted address (${predictedAddress})`);
        throw new Error(`ADDRESS MISMATCH: computed address (${computedAddress}) != predicted address (${predictedAddress})`);
    }
    if (await isContractDeployed(predictedAddress)) {
        console.log(`Contract already deployed at ${predictedAddress}. Skipping deployment.`);
        return predictedAddress;
    }
    // Deploy using CREATE2,
    const tx = await create2.deploy(contractBytecode, saltBytes, overrides || {});
    await tx.wait();
    if (!(await isContractDeployed(predictedAddress))) {
        console.log(`CREATE2 failed:  No contract at predicted address ${predictedAddress}`);
        throw new Error(`CREATE2 failed:  No contract at predicted address ${predictedAddress}`);
    }
    return predictedAddress;
}
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
const deployUsingCreate2 = async ({ name, signer, factoryOptions, constructorArgs = [], overrides, salt, create2Factory, }) => {
    const deployments = await chainweb.runOverChains(async (cwId) => {
        try {
            // Get chain-specific signers (this is the key part)
            const signers = await ethers.getSigners();
            // Determine the appropriate signer for this chain
            let contractDeployer;
            // First check if custom signer was provided
            if (signer) {
                const signerAddress = await signer.getAddress();
                contractDeployer = signers.find((account) => account.address === signerAddress);
                if (!contractDeployer) {
                    throw new Error(`Can't find signer with address ${signerAddress} on chain ${cwId}`);
                }
            }
            // Then check factory options signer
            else if (factoryOptions === null || factoryOptions === void 0 ? void 0 : factoryOptions.signer) {
                const optionsSignerAddress = await factoryOptions.signer.getAddress();
                contractDeployer = signers.find((account) => account.address === optionsSignerAddress);
                if (!contractDeployer) {
                    throw new Error(`Can't find factory options signer with address ${optionsSignerAddress} on chain ${cwId}`);
                }
            }
            // Finally use default
            else {
                contractDeployer = signers[0];
            }
            const deployerAddress = await contractDeployer.getAddress();
            console.log(`Deploying contract deterministically with signer: ${deployerAddress} on chain ${cwId}`);
            const factory = await ethers.getContractFactory(name, {
                signer: contractDeployer,
                ...factoryOptions,
            });
            const transaction = await factory.getDeployTransaction(...(overrides ? [...constructorArgs, overrides] : constructorArgs));
            // Prepare the bytecode of the contract to deploy
            const contractBytecode = transaction.data;
            // Choose create2 deployment function based on bindToSender flag
            const contractAddress = await deployContract({
                contractBytecode,
                signer: contractDeployer,
                overrides,
                salt,
                create2Factory,
            });
            const contract = factory.attach(contractAddress);
            // Store deployment info in both formats
            // Note: 'chain' and 'network.chainId' represent the Chainweb chain ID (0, 1, etc.)
            // not the EVM chainId. The EVM chainId can be accessed via hre.network.config.chainId
            return {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                contract: contract,
                address: contractAddress,
                chain: cwId,
                deployer: deployerAddress,
                network: {
                    chainId: cwId,
                    name: `${networkStem}${cwId}`,
                },
            };
        }
        catch (error) {
            console.error(`Failed to deploy contract to chainweb chain ${cwId}:`, error);
            return null;
        }
    });
    return {
        deployments: deployments.filter((d) => d !== null),
    };
};
exports.deployUsingCreate2 = deployUsingCreate2;
//# sourceMappingURL=deployContracts.js.map