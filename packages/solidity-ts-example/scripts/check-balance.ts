import { chainweb, ethers } from 'hardhat';

async function main() {
  console.log("Checking ETH balance...");

  // Check Binance hot wallet which typically has a large ETH balance
  const binanceHotWallet = "0xDFd5293D8e347dFe59E90eFd55b2956a1343963d";

  await chainweb.switchChain(0);
  const balance0 = await ethers.provider.getBalance(binanceHotWallet);
  console.log(`ETH balance of ${binanceHotWallet}: ${ethers.formatEther(balance0)} on chain0`);

  await chainweb.switchChain(1);
  const balance1 = await ethers.provider.getBalance(binanceHotWallet);
  console.log(`ETH balance of ${binanceHotWallet}: ${ethers.formatEther(balance1)} on chain1`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });