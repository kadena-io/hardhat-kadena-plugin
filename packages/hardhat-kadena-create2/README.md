# Hardhat Kadena chainweb Plugin

`@kadena/hardhat-create2-proxy` is a Hardhat plugin that allows Ethereum developers to deploy their own create2Factory on chianweb evm.

This plugin uses [`@kadena/hardhat-kadena`](../hardhat-kadena) plugin.

## Contract addresses problem

In the Ethereum the contract addresses derive from msg.sender + nonce. Since nonce changes for each transaction, that makes contract addresses unpredictable. create2 solves this issue. However, the create2 opcode can only be used from soldity (or Yul) code. We therefore need a create2 factory in order to have the same address on all chains.

## Solution

This plugin creates a single purpose key from the deployer key and uses that key only for deploying the create2Factory, not any other type of tx. This way the nonce will always be 0 for a new create2 factory deployment. That means that the resulting create2 factory address stays the same on all chains.

## Important Considerations for Deterministic Deployments

### Address Consistency Requirements

For Create2Factory to maintain the same address across all chains:

1. **Never use the derived secondary key for any other transactions**
   - The system will error if it detects the secondary key has a non-zero nonce
   - If this happens, you must use a new version number to generate a new secondary key

2. **Use the same signer and version when deploying to new chains**
   - To deploy to additional chains later, use the same original signer wallet and version parameter
   - Changing either will result in a different Create2Factory address, which in turn would result in a different address for the contract being deployed.

3. **Keep your original signer safe**
   - If you lose access to the original signer wallet, you can't consistently deploy to new chains
   - Consider using a hardware wallet for the original signer

4. **Version parameter**
   - The version parameter allows you to start fresh with a new secondary key when needed
   - Increment the version if you ever need to redeploy the Create2Factory with a clean state

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
const { deployments } = await chainweb.create2.deployOnChainsUsingCreate2({
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
  // deploy create2Factory contract by using the signer key. the default value is the hardhat first account
  // use version if you want to deploy a fresh create2factory
  deployCreate2Factory: (props?: {
    signer?: Signer;
    version?: number | bigint;
  }) => Promise<
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
  // returns create2Factory address by using the signer key. the default value is the hardhat first account
  // version default value is 1 you can set something else if you deployed different version
  getCreate2FactoryAddress: (props?: {
    signer?: Signer;
    version?: number | bigint;
  }) => Promise<string>;

  // deploy the contract using the default create2Factory; if ypu want different proxy you can use the create2Factory property
  deployOnChainsUsingCreate2: (args: {
    name: string;
    signer?: Signer;
    factoryOptions?: FactoryOptions;
    constructorArgs?: ContractMethodArgs;
    overrides?: Overrides;
    salt: BytesLike;
    create2Factory?: string;
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
}
```

## Additional Examples

### Standard CREATE2 Deployment

```ts
// Deploy with standard CREATE2 (not bound to sender)
const { deployments } = await chainweb.create2.deployOnChainsUsingCreate2({
  name: 'SimpleToken',
  constructorArgs: [ethers.parseUnits('1000000')],
  salt: 'my_salt',
});

// calculate create2 address in front end side
const predictedAddress = ethers.getCreate2Address(
  await getCreate2FactoryAddress(),
  salt,
  initCode,
);

// deployments[0].address === predictedAddress
```

### Using Version Parameter

```ts
// Deploy factory with a specific version
const [create2factoryAddress] = await chainweb.create2.deployCreate2Factory({
  version: 2,
});

// deploy the contract using the create2factory
const { deployments } = await chainweb.create2.deployOnChainsUsingCreate2({
  name: 'SimpleToken',
  constructorArgs: [ethers.parseUnits('1000000')],
  salt: 'my_salt',
  create2Factory: create2factoryAddress,
});

// get create2 address for version 2 factory
const predictedAddress = ethers.getCreate2Address(
  await getCreate2FactoryAddress({ version: 2 }),
  salt,
  initCode,
);
```

For more comprehensive examples of using the CREATE2 functionality, see the test cases in the
[SimpleToken.test.ts](../solidity-ts-example/test/SimpleToken.test.ts) file. These tests demonstrate:

- Deploying a CREATE2 factory across multiple chains
- Using different signers and version parameters
- Predicting contract addresses before deployment
- Verifying cross-chain address consistency
- Testing both standard and sender-bound deployments
- Various combinations of salt and signer parameters

## License

This project is licensed under the MIT License.
