const solc = require('solc');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function needsCompilation() {
  try {
    // Check if output file exists
    const outputPath = path.join(buildDir, 'combined.json');
    if (!fs.existsSync(outputPath)) {
      console.log('Output file missing. Recompilation needed.');
      return true;
    }

    // Check if source has changed
    if (!fs.existsSync(hashFilePath)) {
      console.log('Source hash file missing. Recompilation needed.');
      return true;
    }

    const oldHash = fs.readFileSync(hashFilePath, 'utf8');
    const newHash = crypto.createHash('sha256').update(source).digest('hex');

    return oldHash !== newHash;
  } catch (e) {
    console.log('Error checking compilation need:', e.message);
    return true;
  }
}

console.log('Starting compilation process...');

// Ensure output directory exists
const buildDir = path.resolve(__dirname, '../build/create2-factory');
fs.mkdirSync(buildDir, { recursive: true });
console.log(`Output directory: ${buildDir}`);

// Read the contract source
const contractPath = path.resolve(__dirname, '../contracts/Create2Factory.sol');
console.log(`Looking for contract at: ${contractPath}`);

const source = fs.readFileSync(contractPath, 'utf8');
console.log(`Contract source loaded, length: ${source.length} bytes`);

// Check for source changes
const hashFilePath = path.join(buildDir, '.sourcehash');

// Only compile if needed
if (!needsCompilation()) {
  console.log('Source code unchanged and output exists. Skipping compilation.');
  process.exit(0);
}

// Configure solc input in the format it expects
const input = {
  language: 'Solidity',
  sources: {
    'contracts/Create2Factory.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

// Compile the contract
console.log('Compiling Create2Factory...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

console.log('Compilation completed, processing output...', output);

// Check for errors
if (output.errors) {
  output.errors.forEach((error) => {
    console.error(error.formattedMessage);
  });
  if (output.errors.some((error) => error.severity === 'error')) {
    process.exit(1);
  }
}

// Format output to match combined.json created by native solc
const contractOutput =
  output.contracts['contracts/Create2Factory.sol'].Create2Factory;
const combinedOutput = {
  contracts: {
    'contracts/Create2Factory.sol:Create2Factory': {
      abi: contractOutput.abi,
      bin: contractOutput.evm.bytecode.object,
    },
  },
  version: solc.version(),
};

// Write the output file
fs.writeFileSync(
  path.join(buildDir, 'combined.json'),
  JSON.stringify(combinedOutput, null, 2),
);

console.log(`File written to: ${path.join(buildDir, 'combined.json')}`);

// Save the source hash for future comparisons
const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
fs.writeFileSync(hashFilePath, sourceHash);
console.log(`Source hash saved to: ${hashFilePath}`);
