import { chainweb, ethers } from 'hardhat';

async function main() {
  const deployFactory = await chainweb.create2.deployCreate2Factory();

  console.log(
    'deployCreate2Factory',
    deployFactory.map((r) => ({ chain: r.chain, address: r.address })),
  );

  const deployed = await chainweb.create2.deployContractOnChainsDeterministic({
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
  .then(() => {
    console.log('Running main for the second time');
    console.log(
      'So the process should skip deploying the proxy and contracts as they are already deployed',
    );
    return main();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
