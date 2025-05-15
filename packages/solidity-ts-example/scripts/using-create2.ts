import { chainweb, ethers } from 'hardhat';

// Function to validate addresses aren't duplicated within a chain, but are consistent across chains
function validateAddresses(name: string, addresses: Array<{ id: string, address: string, chain: number }>) {
  console.log(`\nValidating ${name} addresses:`);

  // Group addresses by their identifier prefix (without the chain part)
  const contractGroups = new Map();

  // Extract contract type from ID (remove the chain-specific part)
  for (const { id, address, chain } of addresses) {
    const contractType = id.replace(/ \(chain \d+\)$/, ''); // Remove chain suffix
    if (!contractGroups.has(contractType)) {
      contractGroups.set(contractType, []);
    }
    contractGroups.get(contractType).push({ address, chain });
  }

  let hasError = false;

  // First, validate CROSS-CHAIN CONSISTENCY (addresses SHOULD be the same across chains)
  console.log(`\nValidating cross-chain consistency for ${name}:`);
  for (const [contractType, deployments] of contractGroups.entries()) {
    if (deployments.length > 1) {
      const firstAddress = deployments[0].address;
      let consistent = true;

      for (let i = 1; i < deployments.length; i++) {
        if (deployments[i].address !== firstAddress) {
          console.error(`❌ ERROR: "${contractType}" has DIFFERENT addresses across chains: ` +
            `${firstAddress} (chain ${deployments[0].chain}) vs ` +
            `${deployments[i].address} (chain ${deployments[i].chain})`);
          hasError = true;
          consistent = false;
        }
      }

      if (consistent) {
        console.log(`✓ "${contractType}" has CONSISTENT address ${firstAddress} across all chains`);
      }
    }
  }

  // Second, validate DIFFERENT CONTRACT TYPES have DIFFERENT addresses
  console.log(`\nValidating different contract types have different addresses:`);
  const addressMap = new Map();

  for (const [contractType, deployments] of contractGroups.entries()) {
    // Use the first deployment's address as the representative for this contract type
    const address = deployments[0].address;

    if (addressMap.has(address)) {
      const duplicate = addressMap.get(address);
      console.error(`❌ ERROR: Different contracts have the same address! "${contractType}" has same address as "${duplicate}": ${address}`);
      hasError = true;
    } else {
      addressMap.set(address, contractType);
      console.log(`✓ "${contractType}" has unique address: ${address}`);
    }
  }

  if (hasError) {
    console.error(`❌ ${name} validation failed! This may indicate a security issue.`);
  } else {
    console.log(`✓ All ${name} validations passed successfully`);
  }

  return !hasError;
}

// Function to validate parameters affect addresses as expected
function validateParameterEffect(name: string, comparisons: Array<{ param: string, addressA: string, addressB: string }>) {
  console.log(`\nValidating ${name} parameter effects:`);
  let hasError = false;

  for (const { param, addressA, addressB } of comparisons) {
    if (addressA === addressB) {
      console.error(`❌ ERROR: Changing "${param}" did NOT change the address (${addressA})!`);
      hasError = true;
    } else {
      console.log(`✓ Changing "${param}" correctly results in different address: ${addressA} → ${addressB}`);
    }
  }

  if (hasError) {
    console.error(`❌ Some parameters don't affect the address as expected! This is a security concern.`);
  } else {
    console.log(`✓ All parameter changes produce different addresses as expected`);
  }
  return !hasError;
}

async function main() {
  console.log("Deploying with multiple parameter combinations...");

  // Get signers for different deployment scenarios
  const [defaultSigner, alternativeSigner] = await ethers.getSigners();
  console.log(`Default signer: ${defaultSigner.address}`);
  console.log(`Alternative signer: ${alternativeSigner.address}`);

  // Store all factory deployments for validation
  const factoryDeployments: Array<{ id: string, address: string, chain: number }> = [];

  // 1. Default deployment of Create2Factory
  console.log("\n1. Default Create2Factory deployment");
  const defaultFactory = await chainweb.create2.deployCreate2Factory();
  const defaultFactoryAddresses = {};
  defaultFactory.forEach(f => {
    factoryDeployments.push({ id: `Default Factory (chain ${f.chain})`, address: f.address, chain: f.chain });
    defaultFactoryAddresses[f.chain] = f.address;
  });
  console.log(
    'Factory addresses:',
    defaultFactory.map((r) => ({ chain: r.chain, address: r.address })),
  );

  // 2. Create2Factory with custom signer
  console.log("\n2. Create2Factory with alternative signer");
  const customSignerFactory = await chainweb.create2.deployCreate2Factory({
    signer: alternativeSigner.address,
  });
  const customSignerFactoryAddresses = {};
  customSignerFactory.forEach(f => {
    factoryDeployments.push({ id: `Custom Signer Factory (chain ${f.chain})`, address: f.address, chain: f.chain });
    customSignerFactoryAddresses[f.chain] = f.address;
  });
  console.log(
    'Factory addresses:',
    customSignerFactory.map((r) => ({ chain: r.chain, address: r.address })),
  );

  // 3. Create2Factory with custom version
  console.log("\n3. Create2Factory with custom version (2)");
  const customVersionFactory = await chainweb.create2.deployCreate2Factory({
    version: 2,
  });
  const customVersionFactoryAddresses = {};
  customVersionFactory.forEach(f => {
    factoryDeployments.push({ id: `Custom Version Factory (chain ${f.chain})`, address: f.address, chain: f.chain });
    customVersionFactoryAddresses[f.chain] = f.address;
  });
  console.log(
    'Factory addresses:',
    customVersionFactory.map((r) => ({ chain: r.chain, address: r.address })),
  );

  // 4. Create2Factory with both custom signer and version
  console.log("\n4. Create2Factory with both alternative signer and version");
  const fullCustomFactory = await chainweb.create2.deployCreate2Factory({
    signer: alternativeSigner.address,
    version: 3,
    fundingDeployerWith: '0.5', // Use less funding
  });
  const fullCustomFactoryAddresses = {};
  fullCustomFactory.forEach(f => {
    factoryDeployments.push({ id: `Full Custom Factory (chain ${f.chain})`, address: f.address, chain: f.chain });
    fullCustomFactoryAddresses[f.chain] = f.address;
  });
  console.log(
    'Factory addresses:',
    fullCustomFactory.map((r) => ({ chain: r.chain, address: r.address })),
  );

  // Validate Create2Factory addresses
  validateAddresses("Create2Factory", factoryDeployments);

  // Validate that parameters affect Create2Factory addresses as expected
  const factoryParamComparisons = [];
  for (const chain of Object.keys(defaultFactoryAddresses)) {
    // Check signer effect
    factoryParamComparisons.push({
      param: "signer",
      addressA: defaultFactoryAddresses[chain],
      addressB: customSignerFactoryAddresses[chain]
    });

    // Check version effect
    factoryParamComparisons.push({
      param: "version",
      addressA: defaultFactoryAddresses[chain],
      addressB: customVersionFactoryAddresses[chain]
    });

    // Check combined effect
    factoryParamComparisons.push({
      param: "signer + version",
      addressA: defaultFactoryAddresses[chain],
      addressB: fullCustomFactoryAddresses[chain]
    });

    // Check that signer affects address differently than version
    factoryParamComparisons.push({
      param: "signer vs version",
      addressA: customSignerFactoryAddresses[chain],
      addressB: customVersionFactoryAddresses[chain]
    });
  }
  validateParameterEffect("Create2Factory", factoryParamComparisons);

  // Store all SimpleToken deployments for validation
  const tokenDeployments: Array<{ id: string, address: string, chain: number }> = [];

  // 5. Deploy SimpleToken using default parameters
  console.log("\n5. Deploying SimpleToken with default parameters");
  const defaultDeployment = await chainweb.create2.deployUsingCreate2({
    name: 'SimpleToken',
    constructorArgs: [ethers.parseUnits('1000000')],
  });
  const defaultTokenAddresses = {};
  if (defaultDeployment.deployments.length > 0) {
    console.log('Contract addresses:');
    defaultDeployment.deployments.forEach((deployment) => {
      tokenDeployments.push({ id: `Default SimpleToken (chain ${deployment.chain})`, address: deployment.address, chain: deployment.chain });
      defaultTokenAddresses[deployment.chain] = deployment.address;
      console.log(`${deployment.address} on chain ${deployment.chain}`);
    });
  } else {
    console.log('No contracts deployed');
  }

  // 6. Deploy SimpleToken with custom salt
  console.log("\n6. Deploying SimpleToken with custom salt");
  const customSalt = ethers.id('CUSTOM_SALT_VALUE');
  const customSaltDeployment = await chainweb.create2.deployUsingCreate2({
    name: 'SimpleToken',
    constructorArgs: [ethers.parseUnits('2000000')],
    salt: customSalt,
  });
  const customSaltTokenAddresses = {};
  if (customSaltDeployment.deployments.length > 0) {
    console.log('Contract addresses:');
    customSaltDeployment.deployments.forEach((deployment) => {
      tokenDeployments.push({ id: `Custom Salt SimpleToken (chain ${deployment.chain})`, address: deployment.address, chain: deployment.chain });
      customSaltTokenAddresses[deployment.chain] = deployment.address;
      console.log(`${deployment.address} on chain ${deployment.chain}`);
    });
  } else {
    console.log('No contracts deployed');
  }

  // 7. Deploy SimpleToken with alternative signer
  console.log("\n7. Deploying SimpleToken with alternative signer");
  const customSignerDeployment = await chainweb.create2.deployUsingCreate2({
    name: 'SimpleToken',
    signer: alternativeSigner,
    constructorArgs: [ethers.parseUnits('3000000')],
  });
  const customSignerTokenAddresses = {};
  if (customSignerDeployment.deployments.length > 0) {
    console.log('Contract addresses:');
    customSignerDeployment.deployments.forEach((deployment) => {
      tokenDeployments.push({ id: `Custom Signer SimpleToken (chain ${deployment.chain})`, address: deployment.address, chain: deployment.chain });
      customSignerTokenAddresses[deployment.chain] = deployment.address;
      console.log(`${deployment.address} on chain ${deployment.chain}`);
    });
  } else {
    console.log('No contracts deployed');
  }

  // 8. Deploy SimpleToken with alternative signer AND custom salt
  console.log("\n8. Deploying SimpleToken with alternative signer AND custom salt");
  const anotherSalt = ethers.id('ANOTHER_CUSTOM_SALT');
  const combinedCustomDeployment = await chainweb.create2.deployUsingCreate2({
    name: 'SimpleToken',
    signer: alternativeSigner,
    constructorArgs: [ethers.parseUnits('4000000')],
    salt: anotherSalt,
  });
  const combinedTokenAddresses = {};
  if (combinedCustomDeployment.deployments.length > 0) {
    console.log('Contract addresses:');
    combinedCustomDeployment.deployments.forEach((deployment) => {
      tokenDeployments.push({ id: `Combined Custom SimpleToken (chain ${deployment.chain})`, address: deployment.address, chain: deployment.chain });
      combinedTokenAddresses[deployment.chain] = deployment.address;
      console.log(`${deployment.address} on chain ${deployment.chain}`);
    });
  } else {
    console.log('No contracts deployed');
  }

  // Validate SimpleToken addresses
  validateAddresses("SimpleToken", tokenDeployments);

  // Validate that parameters affect SimpleToken addresses as expected
  const tokenParamComparisons = [];
  for (const chain of Object.keys(defaultTokenAddresses)) {
    // Check salt effect
    tokenParamComparisons.push({
      param: "salt",
      addressA: defaultTokenAddresses[chain],
      addressB: customSaltTokenAddresses[chain]
    });

    // Check signer effect
    tokenParamComparisons.push({
      param: "signer",
      addressA: defaultTokenAddresses[chain],
      addressB: customSignerTokenAddresses[chain]
    });

    // Check combined effect
    tokenParamComparisons.push({
      param: "signer + salt",
      addressA: defaultTokenAddresses[chain],
      addressB: combinedTokenAddresses[chain]
    });

    // Check that salt affects address differently than signer
    tokenParamComparisons.push({
      param: "salt vs signer",
      addressA: customSaltTokenAddresses[chain],
      addressB: customSignerTokenAddresses[chain]
    });
  }
  validateParameterEffect("SimpleToken", tokenParamComparisons);

  // Cross-validate factory addresses and contract addresses
  console.log("\nCross-validating Factory and SimpleToken addresses:");
  const allAddresses = [...factoryDeployments, ...tokenDeployments];
  const hasDuplicates = !validateAddresses("all contracts", allAddresses);

  if (hasDuplicates) {
    console.error("❌ CRITICAL SECURITY ISSUE: Factory and contract deployments have address collisions!");
  } else {
    console.log("✓ No collisions between factory and contract addresses");
  }

  // Print summary of all deployments
  console.log("\n===== DEPLOYMENT SUMMARY =====");
  console.log("Create2Factory Deployments:");
  console.log("1. Default:", defaultFactory[0]?.address);
  console.log("2. Custom Signer:", customSignerFactory[0]?.address);
  console.log("3. Custom Version:", customVersionFactory[0]?.address);
  console.log("4. Full Custom:", fullCustomFactory[0]?.address);

  console.log("\nContract Deployments:");
  console.log("5. Default SimpleToken:", defaultDeployment.deployments[0]?.address);
  console.log("6. Custom Salt SimpleToken:", customSaltDeployment.deployments[0]?.address);
  console.log("7. Custom Signer SimpleToken:", customSignerDeployment.deployments[0]?.address);
  console.log("8. Combined Custom SimpleToken:", combinedCustomDeployment.deployments[0]?.address);
}

main()
  .then(() => {
    console.log('\nDeployment demonstration completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nDeployment failed:', error);
    process.exitCode = 1;
  });