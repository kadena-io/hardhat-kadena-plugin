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
pnpm run deploy:hardhat
```

# Deploy to testnet

To deploy to the Kadena testnet, first copy the env example file:

```
cp .env.example .env

```

Next, replace the value of DEPLOYER_PRIVATE_KEY with the private key for an address that has KDA on the Kadena testnet. You can get testnet KDA from the Kadena EVM [faucet](https://tools.kadena.io/faucet/evm).

Finally, run the deployment script with the following command:

```
pnpm run deploy testnet
```
