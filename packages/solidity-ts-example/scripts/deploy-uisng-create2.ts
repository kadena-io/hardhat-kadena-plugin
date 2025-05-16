import { chainweb, ethers } from 'hardhat';

async function main() {
  const [proxyAddress] = await chainweb.create2.deployCreate2Factory();
  console.log(`Create2 proxy deployed at: ${proxyAddress}`);
  const deployed = await chainweb.create2.deployUsingCreate2({
    name: 'SimpleToken',
    constructorArgs: [ethers.parseUnits('1000000')],
    create2proxy: proxyAddress,
    salt: 'mySalt',
  });
  console.log('Contracts deployed');
  deployed.deployments.forEach(async (deployment) => {
    console.log(`${deployment.address} on ${deployment.chain}`);
  });
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
