const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Deploy the factory
  const Factory = await hre.ethers.getContractFactory('Create2Factory');
  const factory = await Factory.deploy({ sender: deployer.address });
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log('Factory deployed to:', factoryAddress);

  // Prepare the bytecode of the contract to deploy
  const myContractFactory = await hre.ethers.getContractFactory('SimpleToken');
  const transaction = await myContractFactory.getDeployTransaction(
    ethers.parseUnits('1000000'),
    deployer.address,
  );
  const bytecode = transaction.data;
  const salt = ethers.id('salt1');

  // Predict address
  const predictedAddress = await factory.computeAddress(bytecode, salt);
  console.log('Predicted address:', predictedAddress);

  const c2Address = ethers.getCreate2Address(
    factoryAddress,
    salt,
    ethers.keccak256(bytecode),
  );

  console.log('CREATE2 address:', c2Address);

  if (predictedAddress !== c2Address) {
    console.log('Predicted address does not match CREATE2 address');
    process.exit(1);
  }

  console.log('Predicted address matches CREATE2 address');

  // Deploy using CREATE2
  const tx = await factory.deploy(bytecode, salt);
  const receipt = await tx.wait();

  // 🔍 Parse logs to find deployed address
  const event = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === 'Deployed');

  if (event === undefined) {
    throw new Error('Deployed event not found');
  }

  console.log('Deployed at:', event.args[0]);

  const code = await hre.ethers.provider.getCode(predictedAddress);
  if (code === '0x') {
    console.log('No contract at predicted address. Maybe CREATE2 failed?');
  } else {
    console.log('Contract is deployed at predicted address ✅');
  }

  const MyContract = myContractFactory.attach(predictedAddress);
  const owner = await MyContract.owner();
  if (owner !== deployer.address) {
    console.log('Owner is not the sender');
    p;
  }
  console.log('Owner', owner);
  console.log('Balance of owner:', await MyContract.balanceOf(owner));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
