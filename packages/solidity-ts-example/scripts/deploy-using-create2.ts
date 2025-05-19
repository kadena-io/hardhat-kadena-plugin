import { chainweb, ethers } from 'hardhat';

async function main() {
  const [factoryAddress] = await chainweb.create2.deployCreate2Factory();
  console.log(`Create2 factory deployed at: ${factoryAddress}`);

  const salt = ethers.id('mySalt'); // This creates a bytes32 hash of the string

  // Deploy the contract using standard Create2 factory functionality
  console.log('Deploying contract using Create2...');
  const deployed = await chainweb.create2.deployUsingCreate2({
    name: 'SimpleToken',
    constructorArgs: [ethers.parseUnits('1000000')],
    create2Factory: factoryAddress,
    salt: salt,
  });
  console.log('Contracts deployed');
  deployed.deployments.forEach(async (deployment) => {
    console.log(`${deployment.address} on ${deployment.chain}`);
  });

  console.log('Contracts deployed');
}

main()
  .then(() => {
    console.log('Deployment successful'); // Logging a success message.
    console.log('test for second time'); // Logging a test message.
    return main();
  }) // Exiting the process if deployment is successful.
  .then(() => process.exit(0)) // Exiting the process if deployment is successful.
  .catch((error) => {
    console.error(error); // Logging any errors encountered during deployment.
    process.exit(1);
  });
