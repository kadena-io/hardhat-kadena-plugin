const { chainweb } = require('hardhat');
const { ethers } = require('hardhat');

async function main() {
  const contractName = 'SimpleToken';
  const initialSupply = ethers.parseUnits('1000000');

  // Log network type
  const networkName = hre.network.name.toLowerCase();
  console.log(`Running on network: ${networkName}`);
  console.log(
    `Network type: ${networkName.includes('hardhat') || networkName.includes('localhost') ? 'local' : 'external'}`,
  );

  // First deployment with salt1
  console.log('\n=== First Deployment ===');

  const salt1 = ethers.id(
    JSON.stringify({
      name: contractName,
      version: '1.0.0',
      deploymentEnv: 'test1',
    }),
  );
  console.log('Using salt1:', salt1);

  try {
    const deployed1 = await chainweb.deployContractOnChainsDeterministic({
      name: contractName,
      constructorArgs: [initialSupply],
      salt: salt1,
    });

    if (!deployed1.deployments.length) {
      throw new Error('Deployment returned empty array');
    }

    // Add CREATE2 address verification
    const address1 = deployed1.deployments[0].address;
    const expectedAddress = ethers.getCreate2Address(
      // Address will be determined by network type
      deployed1.deployments[0].create2ProxyAddress,
      salt1,
      ethers.keccak256(deployed1.deployments[0].bytecode),
    );

    console.log('Address matches expected:', address1 === expectedAddress);
  } catch (error) {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  }

  const address1 = deployed1.deployments[0]?.address;

  // Verify code exists at deployed address
  const code1 = await ethers.provider.getCode(address1);
  console.log('Code exists at address1:', code1.length > 2);
  console.log('Deployed address:', deployed1.deployments[0].address);

  // Try second deployment with same salt
  console.log('\n=== Second Deployment (Same Salt) ===');
  try {
    const deployed2 = await chainweb.deployContractOnChainsDeterministic({
      name: contractName,
      constructorArgs: [initialSupply],
      salt: salt1,
    });

    // Check if code exists at second deployment
    if (deployed2.deployments.length) {
      const code2 = await ethers.provider.getCode(
        deployed2.deployments[0].address,
      );
      console.log('Code length at second address:', code2.length);
      if (code2.length > 2) {
        console.log('❌ ERROR: Contract deployed again at same address!');
      } else {
        console.log('✅ SUCCESS: No code at second deployment address');
      }
    }
  } catch (error) {
    console.log('✅ SUCCESS: Second deployment failed as expected');
    console.log('Error:', error.message);
  }

  // Deploy with different salt
  console.log('\n=== Third Deployment (Different Salt) ===');
  const saltComponents2 = {
    name: contractName,
    version: '1.0.0',
    deploymentEnv: 'test2', // different environment
  };
  const saltStr2 = JSON.stringify(saltComponents2);
  const salt2 = ethers.id(saltStr2);
  console.log('Using salt2:', salt2);

  const deployed2 = await chainweb.deployContractOnChainsDeterministic({
    name: contractName,
    constructorArgs: [initialSupply],
    salt: salt2,
  });

  const address2 = deployed2.deployments[0]?.address;
  console.log('Second deployment address:', address2);

  // Compare results
  console.log('\n=== Results ===');
  console.log('First successful deployment:', {
    salt: salt1,
    address: address1,
  });
  console.log('Second successful deployment:', {
    salt: salt2,
    address: address2,
  });

  if (address1 !== address2) {
    console.log('✅ SUCCESS: Different salts produced different addresses');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
