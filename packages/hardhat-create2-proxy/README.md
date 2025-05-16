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
  // deploy create2proxy contract by using the signer key. the default value is the hardhat first account
  deployCreate2Factory: (signer?: Signer) => Promise<
    [
      contractAddress: string,
      deployments: {
        contract: unknown;
        address: string;
        chain: number;
        deployer: string;
        network: {
          chainId: number;
          name: string;
        };
      }[],
    ]
  >;
  // returns create2proxy address by using the signer key. the default value is the hardhat first account
  getCreate2FactoryAddress: (signer?: Signer) => Promise<string>;

  // deploy the contract using the default create2proxy; if ypu want different proxy you can use the create2proxy property
  deployUsingCreate2: (args: {
    name: string;
    signer?: Signer;
    factoryOptions?: FactoryOptions;
    constructorArgs?: ContractMethodArgs;
    overrides?: Overrides;
    salt: BytesLike;
    create2proxy?: string;
  }) => Promise<{
    deployments: Array<{
      contract: BaseContract & {
        deploymentTransaction(): ContractTransactionResponse;
      };
      address: string;
      chain: number;
      network: {
        name: string;
      };
    }>;
  }>;

  // return the contract address before deploying it.
  predictContractAddress: (
    contractBytecode: string,
    salt: BytesLike,
    create2proxy?: string,
  ) => Promise<string>;
}
```

## License

This project is licensed under the MIT License.
