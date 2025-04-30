import hre from 'hardhat';

/** This script checks the ETH balance of a specific wallet on two different forked chainweb chains.
 * It is meant to test forking of Ethereum mainnet. Other chains can be forked the same way.
 * An external node should be started uisng `npx hardhat node` with the forking config in hardhat.config.ts
 * An alternative is to remove the forking config from hardhat.config.ts and start the node using `npx hardhat node --fork https://eth.drpc.org`
 * or `npx hardhat node --fork https://eth.drpc.org --fork-block-number <block number>`
 * You can use any RPC URL for the forking, but the one used in this example is a public RPC URL for Ethereum mainnet.
 * Run the script uisng the command `npx hardhat run scripts/check-balance.ts --chainweb localhost`
 * Note the use of chainweb.switchChain to switch between the two chains to get the balance
 */
async function main(account: string) {
  console.log('Checking ETH balance...');

  await hre.chainweb.runOverChains(async (chainId) => {
    const balance = await hre.ethers.provider.getBalance(account);
    console.log(
      `ETH balance of ${account}: ${hre.ethers.formatEther(balance)} on chain ${chainId}`,
    );
  });

  console.log('Done checking ETH balance');
}

// Check Binance hot wallet which typically has a large ETH balance
// const binanceHotWallet = '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d';

const devnetAccount = '0x8849BAbdDcfC1327Ad199877861B577cEBd8A7b6';

main(devnetAccount)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
