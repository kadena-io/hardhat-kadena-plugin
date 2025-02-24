const { Contract, ContractFactory } = require('ethers');

const { ethers } = require('hardhat');

async function main() {
  const simpleTokenFactory = await ethers.getContractFactory('SimpleToken');
  const simpleToken = await simpleTokenFactory.deploy(1000000);
  await simpleToken.deploymentTransaction().wait();
  console.log('Contract deployed to address:', await simpleToken.getAddress());
}

main()
  .then(() => process.exit(0)) // Exiting the process if deployment is successful.
  .catch((error) => {
    console.error(error); // Logging any errors encountered during deployment.
    process.exit(1); // Exiting the process with an error code.
  });
