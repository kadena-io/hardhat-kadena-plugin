# Hardhat Kadena chainweb Plugin

`@kadena/hardhat-create2-proxy` is a Hardhat plugin that allows Ethereum developers to deploy their own create2proxy on chianweb evm.

This plugin uses [`@kadena/hardhat-kadena`](../hardhat-kadena) plugin.

## Contract addresses problem

In the Ethereum the contract addresses drive form msg.sender + nonce. and since nonce chanages for each transaction that makes contract addresses unpredictable. create2 solves this issue however we still need to create2 factory have the same address on all chains.

## Solution

This plugin creates a single purpose key from the deployer key and used that key only for deploying the create2proxy not any other type of tx. This way the nonce will be always 0 for new deploying create2 proxy than meant the result address stays the same on all chains.

## Installation

```bash
npm install @kadena/hardhat-create2-proxy
# or
yarn add @kadena/hardhat-create2-proxy
# or
pnpm install @kadena/hardhat-create2-proxy
```

## Quick Start

1. Import the plugin in your `hardhat.config.ts` (or `.js`):

```typescript
import '@kadena/hardhat-chainweb';
```

2. Add basic configuration:

```typescript
module.exports = {
  solidity: '0.8.20',
  chainweb: {
    hardhat: {
      chains: 3, // Creates a 3-chain network
    },
  },
};
```

3. Using:

```TypeScript
import { chainweb } from 'hardhat';

// deploy your create 2 proxy on all chains if not deployed;
const create2Factories = await chainweb.create2.deployCreate2Factory();
// create2Factory[0].contract // factory deployed on the first chain
// create2Factory[2].contract // factory deployed on the second chain

// deploy your contract on all chains
const { deployments } = await chainweb.create2.deployContractOnChainsDeterministic({
  name: 'SimpleToken',
  constructorArgs: [ethers.parseUnits('1000000')],
});
// deployments[0].contract // deployed contract on first chian
```

## API Reference

### Hardhat Runtime Environment Extensions

The plugin adds `create2` property to `hre.chainweb` the Hardhat Runtime Environment (HRE):

```ts
export interface Create2Helpers {
  // this will return the create2factory address even if its not deployed yet
  getCreate2FactoryAddress: () => Promise<string>;

  // deploy create2factory on chains if its not deployed yet and returns contract instances
  deployCreate2Factory: () => Promise<
    {
      contract: unknown;
      address: string;
      chain: number;
      deployer: string;
      network: {
        chainId: number;
        name: string;
      };
    }[]
  >;

  // deploy your contracts using create2
  deployUsingCreate2: (args: {
    name: string;
    signer?: Signer;
    factoryOptions?: FactoryOptions;
    constructorArgs?: ContractMethodArgs<A>;
    overrides?: Overrides;
    salt?: BytesLike;
  }) => Promise<{
    deployments: {
      contract: unknown;
      address: string;
      chain: number;
      deployer: string;
      network: {
        chainId: number;
        name: string;
      };
    }[];
  }>;

  // predict contract address
  predictContractAddress: (
    contractBytecode: string,
    salt: BytesLike,
  ) => Promise<string>;
}
```

## Config

The create2proxy accept two optional configs `version` and `deployerAddress` that will be used in the process of deploying create2proxy contract.
You can use these config to redeploy create2proxy with different address.

- `version` : the proxy contract version (default = `1`)
- `deployerAddress`: the deployed key that will be used as master key for deriving secondary key (default is the first signer)

```typescript
module.exports = {
  solidity: '0.8.20',
  chainweb: {
    hardhat: {
      chains: 3, // Creates a 3-chain network
    },
  },
  create2proxy: {
    version: 1,
    deployerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
};
```

## License

This project is licensed under the MIT License.
