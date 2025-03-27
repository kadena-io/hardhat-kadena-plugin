const { chainweb } = require('hardhat');

async function main() {
  const deployed = await chainweb.deployContractOnChains({
    name: 'SimpleToken',
    constructorArgs: [ethers.parseUnits('1000000')],
  });

  if (deployed.deployments.length === 0) {
    console.log('No contracts deployed');
    return;
  }
  console.log('Contracts deployed');

  deployed.deployments.forEach(async (deployment) => {
    console.log(`${deployment.address} on ${deployment.chain}`);
  });
}

main()
  .then(() => process.exit(0)) // Exiting the process if deployment is successful.
  .catch((error) => {
    console.error(error); // Logging any errors encountered during deployment.
    process.exit(1); // Exiting the process with an error code.
  });
