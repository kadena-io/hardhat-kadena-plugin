import { chainweb, ethers } from 'hardhat';

async function main() {
  const verificationDelay = process.env.VERIFICATION_DELAY
    ? parseInt(process.env.VERIFICATION_DELAY)
    : 10000; // Default 10 seconds

  const [factoryAddress] = await chainweb.create2.deployCreate2Factory();
  console.log(`Create2 factory deployed at: ${factoryAddress}`);

  const salt = ethers.id('mySalt'); // This creates a bytes32 hash of the string

  // Make sure we're on the first chainweb chain
  const chains = await chainweb.getChainIds();
  await chainweb.switchChain(chains[0]);
  const [deployer] = await ethers.getSigners();

  // Deploy the contract using standard Create2 factory functionality
  console.log('Deploying contract using Create2...');
  const deployed = await chainweb.create2.deployOnChainsUsingCreate2({
    name: 'SimpleToken',
    constructorArgs: [ethers.parseUnits('1000000'), deployer.address],
    create2Factory: factoryAddress,
    salt: salt,
  });
  console.log('Contracts deployed');
  deployed.deployments.forEach(async (deployment) => {
    console.log(`${deployment.address} on ${deployment.chain}`);
  });

  console.log('Contracts deployed');
  // Filter out failed deployments
  const successfulDeployments = deployed.deployments.filter((d) => d !== null);

  if (successfulDeployments.length > 0) {
    console.log(
      `Faucet successfully deployed to ${successfulDeployments.length} chains`,
    );

    // Create a map of deployments by chain ID for easy lookup
    const deploymentsByChain = {};
    for (const deployment of successfulDeployments) {
      deploymentsByChain[deployment.chain] = deployment;
    }

    // Process deployments using runOverChains for consistency
    await chainweb.runOverChains(async (chainId) => {
      // Skip chains that weren't in our successful deployments
      if (!deploymentsByChain[chainId]) {
        console.log(
          `No deployment for chain ${chainId}, skipping verification`,
        );
        return;
      }

      const deployment = deploymentsByChain[chainId];

      // Access deployment information
      const contractAddress = deployment.address;

      console.log(
        `Verifying contract with address ${contractAddress} on chain ${chainId}...`,
      );

      // No need for explicit chain switching, runOverChains does that for us

      // Now handle verification
      // Check if we're on a local network
      const isLocalNetwork =
        network.name.includes('hardhat') || network.name.includes('localhost');

      // Skip verification for local networks
      if (isLocalNetwork) {
        console.log(
          `Skipping contract verification for local network: ${network.name}`,
        );
      } else {
        try {
          console.log(
            `Waiting ${verificationDelay / 1000} seconds before verification...`,
          );

          // Optional delay for verification API to index the contract
          if (verificationDelay > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, verificationDelay),
            );
          }

          console.log(`Attempting to verify contract on chain ${chainId}...`);
          await run('verify:verify', {
            address: contractAddress,
            constructorArguments: [ethers.parseUnits('1000000'), deployer.address],
            force: true,
          });

          console.log(`✅ Contract successfully verified on chain ${chainId}`);
        } catch (verifyError) {
          console.error(
            `Error verifying contract on chain ${chainId}:`,
            verifyError.message,
          );
        }

        deployed.deployments.forEach(async (deployment) => {
          console.log(`${deployment.address} on ${deployment.chain}`);
        });
      }
    });
  }
}

main()
  .then(() => process.exit(0)) // Exiting the process if deployment is successful.
  .catch((error) => {
    console.error(error); // Logging any errors encountered during deployment.
    process.exit(1); // Exiting the process with an error code.
  });
