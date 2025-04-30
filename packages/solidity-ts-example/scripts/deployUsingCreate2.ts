import hre from 'hardhat';
import { SimpleToken } from '../typechain-types';

const { ethers } = hre;

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const owner = await deployer.getAddress();

  const contracts =
    await hre.chainweb.deployContractOnChainsUsingCreate2<SimpleToken>({
      name: 'SimpleToken',
      constructorArgs: [ethers.parseUnits('1000000'), owner],
    });

  console.log('owner:', owner);

  contracts.deployments.forEach(async (deployment) => {
    console.log(
      `chainId: ${deployment.chain}, contract: ${deployment.address}, owner balance: ${await ethers.provider.getBalance(owner)}`,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
