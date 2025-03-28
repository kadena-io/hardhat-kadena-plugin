import { ethers } from 'hardhat';


async function main() {
  console.log("Checking ETH balance...");

  // Check Binance hot wallet which typically has a large ETH balance
  const binanceHotWallet = "0xDFd5293D8e347dFe59E90eFd55b2956a1343963d";

  const balance = await ethers.provider.getBalance(binanceHotWallet);
  console.log(`ETH balance of ${binanceHotWallet}: ${ethers.formatEther(balance)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });