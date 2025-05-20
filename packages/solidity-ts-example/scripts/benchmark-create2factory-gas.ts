import { ethers } from 'hardhat';
import create2Artifact from '../../hardhat-kadena-create2/build/create2-factory/combined.json';

//Run this script against localhost
// Start node using npx hardhat node
// Run in another terminal with command npx hardhat run scripts/benchmark-create2create2Factory-gas.ts --chainweb localhost
async function main() {
  // Set up a provider (using a local node or testnet)
  const provider = new ethers.JsonRpcProvider(
    'http://127.0.0.1:8545/chain/20/evm/rpc',
  );

  // Get a wallet with some funds
  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Default Hardhat first account
  const wallet = new ethers.Wallet(privateKey, provider);

  // Get the ABI and bytecode
  const create2Artifacts =
    create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory'];
  const contractBytecode = '0x' + create2Artifacts.bin;
  const abi = create2Artifacts.abi;

  // Create a ContractFactory
  const create2Factory = new ethers.ContractFactory(
    abi,
    contractBytecode,
    wallet,
  );

  // Do multiple deployments to get an average
  const numDeployments = 5;
  const gasUsedArray: bigint[] = [];
  const deployedAddresses: string[] = [];

  console.log(
    `\nPerforming ${numDeployments} deployments to calculate average gas usage...`,
  );

  for (let i = 0; i < numDeployments; i++) {
    console.log(`\nDeployment ${i + 1}/${numDeployments}:`);

    // Deploy the contract
    const contract = await create2Factory.deploy();
    await contract.waitForDeployment();

    const deploymentReceipt = await provider.getTransactionReceipt(
      contract.deploymentTransaction()!.hash,
    );
    const gasUsed = deploymentReceipt?.gasUsed || BigInt(0);
    const gasPrice = deploymentReceipt?.gasPrice || BigInt(0);

    gasUsedArray.push(gasUsed);
    deployedAddresses.push(await contract.getAddress());

    console.log(`- Contract deployed at: ${await contract.getAddress()}`);
    console.log(`- Gas used: ${gasUsed.toString()}`);
    console.log(`- Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
    console.log(
      `- Deployment cost: ${ethers.formatEther(gasUsed * gasPrice)} ETH`,
    );
  }

  // Calculate average gas used
  const totalGasUsed = gasUsedArray.reduce((sum, gas) => sum + gas, BigInt(0));
  const averageGasUsed = totalGasUsed / BigInt(numDeployments);

  console.log(`\n===== Results =====`);
  console.log(`Total deployments: ${numDeployments}`);
  console.log(`Average gas used: ${averageGasUsed.toString()}`);

  // Calculate costs at different gas prices
  const gasPrices = [5n, 10n, 20n, 50n, 100n]; // gwei
  console.log(`\nEstimated costs at different gas prices:`);

  for (const gweiPrice of gasPrices) {
    const weiPrice = gweiPrice * BigInt(1_000_000_000);
    const cost = averageGasUsed * weiPrice;
    console.log(`At ${gweiPrice} gwei: ${ethers.formatEther(cost)} ETH`);
  }

  // Recommended funding values with different safety buffers
  console.log(`\nRecommended 'requiredEther' values:`);

  // Standard gas price with increasing safety buffers
  const standardGasPrice = 20n * BigInt(1_000_000_000); // 20 gwei
  const buffers = [1.2, 1.5, 2.0]; // 20%, 50%, 100% buffers

  for (const buffer of buffers) {
    const baseCost = averageGasUsed * standardGasPrice;
    const bufferedCost = BigInt(Math.ceil(Number(baseCost) * buffer));
    console.log(
      `With ${Math.round((buffer - 1) * 100)}% buffer at 20 gwei: '${ethers.formatEther(bufferedCost)}' ETH`,
    );
  }

  // Final recommendation with comprehensive explanation
  const recommendedFunding = BigInt(
    Math.ceil(Number(averageGasUsed * standardGasPrice) * 1.5),
  );
  console.log(`\n=== RECOMMENDED VALUE ===`);
  console.log(
    `Recommended 'requiredEther' value: '${ethers.formatEther(recommendedFunding)}' ETH`,
  );
  console.log(`This includes:`);
  console.log(`- Average gas used: ${averageGasUsed.toString()} gas units`);
  console.log(`- At a gas price of 20 gwei`);
  console.log(`- With a 50% safety buffer for network congestion`);
  console.log(
    `\nCurrent default of '1.0' ETH is ${(1.0 / Number(ethers.formatEther(recommendedFunding))).toFixed(1)}x higher than needed`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
