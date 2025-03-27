import { chainweb, ethers } from 'hardhat';

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

  // get the ETH value of an EOA account
  const balance = await ethers.provider.getBalance("0x44599C58D5F56918064FE4A7DB0D6543b401C4a3");
  console.log(`Address balance: ${balance}`);
}

main()
  .then(() => process.exit(0)) // Exiting the process if deployment is successful.
  .catch((error) => {
    console.error(error); // Logging any errors encountered during deployment.
    process.exit(1); // Exiting the process with an error code.
  });
