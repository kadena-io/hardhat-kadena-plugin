const { chainweb } = require('hardhat');
const { ethers } = require('hardhat');

async function main() {
  // Contract details
  const contractName = 'SimpleToken';
  const initialSupply = ethers.parseUnits('1000000');

  // Get contract bytecode to include in salt calculation (for versioning)
  const SimpleTokenFactory = await ethers.getContractFactory(contractName);

  // Salt could be anything. Generating it here to be more complex than a simple string
  // This approach ties the salt to specific contract parameters and version
  const saltComponents = {
    name: contractName,
    version: "1.0.0",
    deploymentEnv: "testnet",
  };

  // Create salt string as JSON
  const saltStr = JSON.stringify(saltComponents);
  console.log(`Using salt components:`, saltComponents);

  // Hash the salt string to get the actual bytes32 salt
  const salt = ethers.id(saltStr);
  console.log(`Salt (bytes32): ${salt}`);

  console.log("About to call deployContractOnChainsDeterministic");

  const deployed = await chainweb.deployContractOnChainsDeterministic({
    name: contractName,
    constructorArgs: [initialSupply],
    salt: salt,
  });

  console.log("After call deployContractOnChainsDeterministic");

  if (deployed.deployments.length === 0) {
    console.log('No contracts deployed');
    return;
  }
  console.log('Contracts deployed deterministically');

  // Check if all addresses are the same
  const addresses = deployed.deployments.map(d => d.address.toLowerCase());
  const allSame = addresses.every(addr => addr === addresses[0]);

  if (allSame && deployed.deployments.length > 1) {
    console.log(`✅ SUCCESS: All contracts have the same address: ${addresses[0]}`);
  }

  deployed.deployments.forEach((deployment) => {
    console.log(`${deployment.address} on ${deployment.chain}${deployment.alreadyDeployed ? ' (already deployed)' : ''}`);
  });

  // Save deployment information for future reference
  const deploymentInfo = {
    contract: contractName,
    version: saltComponents.version,
    deploymentTime: new Date().toISOString(),
    salt: salt,
    saltComponents: saltComponents,
    deployments: deployed.deployments.map(d => ({
      address: d.address,
      chain: d.chain,
      alreadyDeployed: !!d.alreadyDeployed
    }))
  };

  console.log('Deployment info:', JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });