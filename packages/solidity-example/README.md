# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
```

# Deploy to Hardhat

To deploy the example to hardhat, run

```
npm run deploy:hardhat
```

To deploy using CREATE2, run

```
npm run deploy-create2:hardhat
```

# Deploy to the sandbox (local devnet)

To deploy to the Kadena sandbox, first clone the sandbox [repo](https://github.com/kadena-io/kadena-evm-sandbox) and follow the instructions to start it up. This sandbox simulates the real Kadena Chainweb EVM blockchain. However, you can use this plugin to develop as usual within Hardhat V2. This plugin simulates the Kadena EVM blockchain.

To deploy to the sandbox and verify the contract (verification does not run against hardhat), run

```
npm run deploy sandbox
```

To deploy using CREATE2, run

```
npm run deploy-create2 sandbox
```
