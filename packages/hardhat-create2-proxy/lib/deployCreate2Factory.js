"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployCreate2Factory = exports.getCreate2FactoryAddress = exports.create2Artifacts = void 0;
exports.deriveSecondaryKey = deriveSecondaryKey;
const ethers_1 = require("ethers");
const combined_json_1 = __importDefault(require("../build/create2-factory/combined.json"));
const hardhat_1 = __importStar(require("hardhat"));
const hardhat_chainweb_1 = require("@kadena/hardhat-chainweb");
const networkStem = (0, hardhat_chainweb_1.getNetworkStem)(hardhat_1.default.config.defaultChainweb);
function isContractDeployed(address) {
    return hardhat_1.ethers.provider.getCode(address).then((code) => code !== '0x');
}
exports.create2Artifacts = combined_json_1.default.contracts['contracts/Create2Factory.sol:Create2Factory'];
const getCreate2FactoryAddress = async ({ signer, version = BigInt(1) } = {}) => {
    // Get default signer if none provided
    const signers = await hardhat_1.ethers.getSigners();
    const masterDeployer = signer || signers[0];
    // Derive the secondary key directly with version parameter
    const secondaryKey = await deriveSecondaryKey(masterDeployer, version);
    // Calculate factory address
    const factoryAddress = (0, ethers_1.getCreateAddress)({
        from: secondaryKey.publicKey,
        nonce: 0,
    });
    return factoryAddress;
};
exports.getCreate2FactoryAddress = getCreate2FactoryAddress;
async function deriveSecondaryKey(signer, version = BigInt(1)) {
    const message = `DeployerKey:v1:create2:${version}`;
    const signature = await signer.signMessage(message);
    // Combine signature and label to get deterministic entropy
    const hash = (0, ethers_1.keccak256)((0, ethers_1.toUtf8Bytes)(signature));
    // Use first 32 bytes (64 hex chars + '0x') as the private key
    const derivedPrivateKey = '0x' + hash.slice(2, 66);
    const wallet = new ethers_1.Wallet(derivedPrivateKey, signer.provider);
    console.log(`Derived secondary key for create2 factory version ${version}: ${derivedPrivateKey}`);
    return {
        publicKey: await wallet.getAddress(),
        privateKey: derivedPrivateKey,
    };
}
async function fundAccount(sender, receiver, amount) {
    const receiverAddress = await receiver.getAddress();
    const tx = await sender.sendTransaction({
        to: receiverAddress,
        value: amount,
    });
    await tx.wait();
    const receiverBalance = await hardhat_1.ethers.provider.getBalance(receiverAddress);
    if (receiverBalance < amount) {
        throw new Error(`Funding deployer failed. Receiver balance: ${receiverBalance} is less than funding amount: ${amount}`);
    }
}
const deployCreate2Factory = async ({ signer, version = BigInt(1) } = {}) => {
    let secondaryPrivateKey = undefined;
    const getSecondaryWallet = async (signer) => {
        if (secondaryPrivateKey) {
            return new ethers_1.Wallet(secondaryPrivateKey, hardhat_1.ethers.provider);
        }
        secondaryPrivateKey = (await deriveSecondaryKey(signer, version))
            .privateKey;
        return new ethers_1.Wallet(secondaryPrivateKey, hardhat_1.ethers.provider);
    };
    const result = await hardhat_1.chainweb.runOverChains(async (cwId) => {
        const signers = await hardhat_1.ethers.getSigners();
        let masterDeployer;
        if (!signer) {
            masterDeployer = signers[0];
        }
        else {
            // Get the address of the passed-in signer
            const signerAddress = await signer.getAddress();
            // Find the matching signer from the current chain's signers
            masterDeployer = signers.find((account) => account.address === signerAddress);
            if (!masterDeployer) {
                throw new Error(`Can't find account with address ${signerAddress}`);
            }
        }
        console.log('masterDeployer in deployCreate2Factory', masterDeployer);
        if (masterDeployer) {
            const address = await masterDeployer.getAddress();
            console.log('masterDeployer address in deployCreate2Factory', address);
            const balance = await hardhat_1.ethers.provider.getBalance(address);
            console.log('masterDeployer balance in deployCreate2Factory', hardhat_1.ethers.formatEther(balance), 'ETH');
        }
        const secondaryKey = await getSecondaryWallet(masterDeployer);
        const secondaryKeyAddress = await secondaryKey.getAddress();
        const create2FactoryAddress = hardhat_1.ethers.getCreateAddress({
            from: secondaryKey.address,
            nonce: 0,
        });
        const isDeployed = await isContractDeployed(create2FactoryAddress);
        if (isDeployed) {
            const Factory = await hardhat_1.default.ethers.getContractFactory(exports.create2Artifacts.abi, exports.create2Artifacts.bin);
            const create2 = Factory.attach(create2FactoryAddress);
            console.log(`The create2 factory address ${create2FactoryAddress} is already deployed on chain ${cwId}`);
            return {
                contract: create2,
                address: create2FactoryAddress,
                chain: cwId,
                deployer: secondaryKeyAddress,
                network: {
                    chainId: cwId,
                    name: `${networkStem}${cwId}`,
                },
            };
        }
        const nonce = await hardhat_1.ethers.provider.getTransactionCount(secondaryKeyAddress);
        if (nonce > 0) {
            throw new Error(`This derived deployer address ${secondaryKeyAddress} has already been used for another type of transaction. You need a new address to deploy a create2 factory.
          Please use a different signer or version.`);
        }
        console.log(`The create2 factory contract will be deployed to address: ${create2FactoryAddress} with deployer address: ${secondaryKeyAddress}`);
        const balance = await hardhat_1.ethers.provider.getBalance(secondaryKeyAddress);
        const CREATE2Factory = await hardhat_1.default.ethers.getContractFactory(combined_json_1.default.contracts['contracts/Create2Factory.sol:Create2Factory']
            .abi, combined_json_1.default.contracts['contracts/Create2Factory.sol:Create2Factory']
            .bin, secondaryKey);
        // Get detailed fee data
        const tx = await CREATE2Factory.getDeployTransaction();
        const gasLimit = await hardhat_1.ethers.provider.estimateGas(tx);
        const feeData = await hardhat_1.ethers.provider.getFeeData();
        let requiredEther;
        let deployOptions;
        // Check if we can get proper EIP-1559 fee data
        if (gasLimit && feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            // Use EIP-1559 fee structure
            const maxFeePerGas = feeData.maxFeePerGas;
            // Calculate required funding with 20% buffer (base fee can change between blocks)
            requiredEther = (maxFeePerGas * gasLimit * BigInt(120)) / BigInt(100);
            deployOptions = {
                gasLimit,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            };
            console.log('Using EIP-1559 fee model');
        }
        else if (gasLimit && feeData.gasPrice) {
            // Fallback to legacy fee structure
            requiredEther =
                (feeData.gasPrice * gasLimit * BigInt(120)) / BigInt(100);
            deployOptions = {
                gasLimit,
                gasPrice: feeData.gasPrice,
            };
            console.warn('Network returned legacy fee data instead of EIP-1559. Using legacy fee model.');
        }
        else {
            // Something failed in estimation, use benchmark data
            console.warn('Fee data unavailable. Using fallback values from benchmark.');
            // Use benchmark-based values (266,268 gas with buffer)
            const benchmarkGasLimit = BigInt(300000); // Rounded up from 266,268
            deployOptions = {
                gasLimit: benchmarkGasLimit,
            };
            // 0.008 KDA (slightly higher than benchmarked 0.00798804)
            requiredEther = hardhat_1.ethers.parseEther('0.008');
            console.warn(`Using fallback gas limit of ${benchmarkGasLimit} and funding amount of ${hardhat_1.ethers.formatEther(requiredEther)} KDA`);
        }
        if (balance >= requiredEther) {
            console.log('Existing balance:', hardhat_1.ethers.formatEther(balance), 'KDA', '(sufficient for deployment)');
        }
        else {
            // Calculate how much additional funding is needed
            const additionalFunding = requiredEther - balance;
            console.log(`Current balance: ${hardhat_1.ethers.formatEther(balance)} KDA, required: ${hardhat_1.ethers.formatEther(requiredEther)} KDA`);
            console.log(`FUNDING create2 factory derived deployer with ${hardhat_1.ethers.formatEther(additionalFunding)} KDA`);
            await fundAccount(masterDeployer, secondaryKey, additionalFunding);
        }
        // Use the appropriate gas options for deployment
        const contract = await CREATE2Factory.deploy(deployOptions);
        const deploymentTx = contract.deploymentTransaction();
        if (!deploymentTx) {
            throw new Error('Create2 factory deployment transaction failed');
        }
        await deploymentTx.wait();
        if (create2FactoryAddress !== (await contract.getAddress())) {
            throw new Error('Create2 factory address mismatch');
        }
        console.log(`Create2 factory deployed at ${create2FactoryAddress} on chain ${cwId}`);
        return {
            contract: contract,
            address: create2FactoryAddress,
            chain: cwId,
            deployer: secondaryKeyAddress,
            network: {
                chainId: cwId,
                name: `${networkStem}${cwId}`,
            },
        };
    });
    if (result.length === 0) {
        throw new Error('No result from deployCreate2Factory');
    }
    // Clear the private key from memory when done
    secondaryPrivateKey = undefined;
    return [result[0].address, result];
};
exports.deployCreate2Factory = deployCreate2Factory;
//# sourceMappingURL=deployCreate2Factory.js.map