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

// deploy your create 2 proxy on all chains
const create2Factories = await chainweb.create2.deployCreate2Factory();
// create2Factory[0].contract // factory deployed on the first chain
// create2Factory[2].contract // factory deployed on the second chain

// deploy your contract on all chains
const deployed = await chainweb.create2.deployContractOnChainsDeterministic({
  name: 'SimpleToken',
  constructorArgs: [ethers.parseUnits('1000000')],
});
// deployed[0]..contract // deployed contract on first chian
```

## API Reference

### Hardhat Runtime Environment Extensions

The plugin adds `create2` property to `hre.chainweb` the Hardhat Runtime Environment (HRE):

```ts
export interface Create2Helpers {
  getCreate2FactoryAddress: (
    signer: Signer,
    version?: number,
  ) => Promise<string>;
  deployContractOnChainsDeterministic: (
    args: {
    name: string;
    signer?: Signer;
    factoryOptions?: FactoryOptions;
    constructorArgs?: ContractMethodArgs<A>;
    overrides?: Overrides;
    salt?: BytesLike
  }
  ) => Promise<{
    deployments: DeployedContractsOnChains<T>[];
  }>;;
  deployCreate2Factory: (props?: {
    signer?: string;
    version?: number;
    fundingDeployerWith?: string;
  }) => Promise<
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
  predictContractAddress: (
    contractBytecode: string,
    signer: Signer | HardhatEthersSigner,
    salt: BytesLike,
  ) => Promise<string>;
  deriveSecondaryKey(
    signer: Signer,
    version?: number,
  ): Promise<{
    publicKey: string;
    privateKey: string;
  }>;
}
```

#### Origin type

Origin type for spv proof creation

```Ts
interface Origin {
  chain: bigint;
  originContractAddress: string;
  height: bigint;
  txIdx: bigint;
  eventIdx: bigint;
}
```

| Function                 | Parameters                                                                                                                     | Return Type                                        | Description                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getProvider`            | `cid: number`                                                                                                                  | `HardhatEthersProvider`                            | Retrieves the provider for a specified chain.                                                                                                                                                                                                 |
| `requestSpvProof`        | `targetChain: number, origin: Origin`                                                                                          | `Promise<string>`                                  | Requests an SPV proof for a cross-chain transaction.                                                                                                                                                                                          |
| `switchChain`            | `cid: number`                                                                                                                  | `Promise<void>`                                    | Switches the active chain.                                                                                                                                                                                                                    |
| `getChainIds`            | None                                                                                                                           | `number[]`                                         | Returns an array of available chain IDs.                                                                                                                                                                                                      |
| `callChainIdContract`    | None                                                                                                                           | `Promise<number>`                                  | Calls a contract to get the chain ID.                                                                                                                                                                                                         |
| `deployContractOnChains` | `{name: string;signer?: Signer;factoryOptions?: FactoryOptions; constructorArgs?: ContractMethodArgs ;overrides?: Overrides;}` | check`deployContractOnChains`of`ChainwebPluginApi` | Deploys a contract on multiple chains.                                                                                                                                                                                                        |
| `createTamperedProof`    | `targetChain: number, origin: Origin`                                                                                          | `Promise<string>`                                  | Creates a tampered SPV proof for testing purposes.                                                                                                                                                                                            |
| `computeOriginHash`      | `origin: Origin`                                                                                                               | `string`                                           | Computes the hash of a transaction origin.                                                                                                                                                                                                    |
| `runOverChains`          | `callback: (chainId: number) => Promise<T>`                                                                                    | `Promise<T[]>`                                     | Run the callback for all chains; the function switches the context so no need to call switchChain inside the callback                                                                                                                         |
| `initialize`             | None                                                                                                                           | void                                               | This function is called internally when using`node`, `test`, `run` command, so you mostly dont need it, However if you need to use the plugin in other command (e.g developing another plugin on top of this ) then you can call the function |

### Example

```TS
import { chainweb } from "hardhat"

await chainweb.deployContractOnChains({name: "SimpleToken",  constructorArgs: [ethers.parseUnits('1000000')] }) // deploy contract on all chains
await chainweb.switchChain(0); // configure hardhat to use chain 0
```

## Precompiles

The in-process chainweb comes with two `precompiles` that the addresses are accessible via `hre.config.chainweb[config_name].precompiles`.

### CHAIN_ID_PRECOMPILE

the precompile that returns the chain index.

address: `address(uint160(uint256(keccak256('/Chainweb/Chain/Id/'))))`

#### Example of getting chainwebChainId

```Solidity
address public constant CHAIN_ID_PRECOMPILE =
  address(uint160(uint256(keccak256('/Chainweb/Chain/Id/'))));

function getChainwebChainId() public view returns (uint32 cid) {
  (bool success, bytes memory c) = CHAIN_ID_PRECOMPILE.staticcall('');
  require(success, ChainwebChainIdRetrievalFailed());
  require(c.length == 4, InvalidChainwebChainId());
  cid = uint32(bytes4(c));
}
```

### VALIDATE_PROOF_PRECOMPILE

the precompile that verifys a spv proof;

address: `address(uint160(uint256(keccak256('/Chainweb/KIP-34/VERIFY/SVP/'))))`

#### Example of getting spvProof

```Solidity

address public constant VALIDATE_PROOF_PRECOMPILE =
    address(uint160(uint256(keccak256('/Chainweb/KIP-34/VERIFY/SVP/'))));
...

function verifySPV(
  bytes memory proof
)
  public
  view
  returns (CrossChainMessage memory crossChainMessage, bytes32 originHash)
{
  (bool success, bytes memory data) = VALIDATE_PROOF_PRECOMPILE.staticcall(
    proof
  );
  require(success, SPVVerificationFailed());
  crossChainMessage = abi.decode(data, (CrossChainMessage));
  originHash = keccak256(abi.encode(crossChainMessage.origin));
  require(!completed[originHash], AlreadyCompleted(originHash));
};

```

### Overloading `hardhat-switch-network`

This plugin overrides `switchNetwork` from `hardhat-switch-network` to load the correct Chainweb provider while also supporting switching by chain index. For example, `switchNetwork(1)` switches to chain 1 of Chainweb.

## RPC Server

You can run Chainweb as a single node using the hardhat node command. This will spin up the chains based on the Chainweb configuration and expose both http and ws ports with URLs following this pattern. You can also pass standard Hardhat configuration options like hostname and port to change the default values. Note that fork is not supported yet.

### Chain URLs

http://127.0.0.1:8545/chain/:chainIndex

### Example for multiple chains:

http://127.0.0.1:8545/chain/0

http://127.0.0.1:8545/chain/1

## SPV Proof Requests

The server also accepts requests for SPV proofs with the following URL pattern:

```URL
GET /:externalHostUrl/chain/:targetChain/spv/chain/:sourceChain/height/:height/transaction/:txIdx/event/:eventIdx
```

check the [Origin interface](#Origin-type) for the details

### Example SPV proof request:

http://127.0.0.1:8545/chain/1/spv/chain/0/height/1234/transaction/16666/event/1123123123

## Tasks

you can use the following command with chainweb which override the `defaultChainweb`

### hardhat node

```bash
npx hardhat node --chainweb CHAINWEB_NAME
```

### hardhat run

```bash
npx hardhat run ./scripts/my-script.js --chainweb CHAINWEB_NAME
```

### hardhat test

```bash
npx hardhat test --chainweb CHAINWEB_NAME
```

### hardhat print-config

Print the final configuration; this is useful for debugging since the plugin adds the networks to the final config

```bash
npx hardhat print-config
# the complete hardhat config as JSON
```

## Examples

- [JavaScript example project](https://github.com/kadena-io/hardhat-kadena-plugin/tree/main/packages/solidity-example)

- [TypeScript example project](https://github.com/kadena-io/hardhat-kadena-plugin/tree/main/packages/solidity-ts-example)

## FAQ

### **Why Adding Custom Chainwebs**

You likely add external chainwebs for targeting different networks. like one for tesnet, mainnet or devnet and etc

```typescript
module.exports = {
  solidity: '0.8.28',
  chainweb: {
    // testing external dev-net
    devnet: {
      type: 'external',
      chains: 20,
      externalHostUrl: 'http://localhost:1234',
    },
    // this network is not available yet
    testnet: {
      type: 'external',
      chains: 20,
      externalHostUrl: 'http://testnet.kadena.io',
      // if the network uses different precompiles address
      precompiles: {
        chainwebChainId: '0x0000000000000000000000000000000000000100',
        spvVerify: '0x0000000000000000000000000000000000000101',
      },
    },
  },
};
```

You can use several "in-process" chainweb config for testing your smart contract behavior against different chain numbers or graphs or any other configuration

```typescript
module.exports = {
  solidity: '0.8.28',
  chainweb: {
    // use 2 chains for regular development so tests run fast
    hardhat: {
      chains: 2,
    },
    // use 5 chains with a custom graph that is close to testnet
    semiTestnet: {
      chains: 20,
    },
    // use 3 chains with a custom graph
    nonStandardGraphChainweb: {
      chains: 3,
      graph: {
        0: [1],
        1: [2],
        2: [0],
      },
    },
  },
};
```

#### Research Graph behaviors

Graph has direct impact on the security and performance of the chainweb is also might change the SPV proof creation and verification time, so you can use this option for more advanced scenarios.

```typescript
module.exports = {
  chainweb: {
    // this config uses 4 in-process chains.
    custom_graph_chainweb: {
      chains: 4,
      // using a custom graph to see the network behavior
      graph: {
        0: [1],
        1: [0, 2, 3],
        2: [0],
        3: [1, 2, 0],
      },
    },
  },
};
```

### **How to use advance hardhat configs**

All in-process networks inherit the default hardhat network configuration so if for example you want to set `allowUnlimitedContractSize` you just need to add it to the config

```typescript
module.exports = {
  solidity: '0.8.28',
  networks: {
    // then both hardhat and semiTestnet chainweb uses this config since both are internal
    hardhat: {
      gasPrice : 0.1
    }
  }
  chainweb: {
    hardhat: {
      chains: 2,
    },
    semiTestnet: {
      chains: 20,
    },
  },
};
```

### **What is the difference between `in-process` and `external` Chainweb types?**

- **`in-process`**: Runs Chainweb as part of Hardhat's local network, ideal for development and testing.
- **`external`**: Connects to an existing Chainweb network (e.g., testnet or mainnet) using an external RPC.

### **How do I switch between different Chainwebs?**

Use the `--chainweb` flag in your Hardhat commands:

```bash
npx hardhat test --chainweb devnet
```

Or manually set the `defaultChainweb` in your config.

### **How do I deploy a contract to all chains in my Chainweb setup?**

Use the `deployContractOnChains` function:

```ts
await chainweb.deployContractOnChains('SimpleToken');
```

This will deploy the contract to all available chains.

### **How can I request an SPV proof for a cross-chain transaction?**

Use the `requestSpvProof` function:

```ts
const proof = await chainweb.requestSpvProof(targetChain, origin);
```

### **Can I customize the Chainweb chain connection graph?**

Yes, you can define a custom graph in your configuration:

```ts
chainweb: {
  customGraphChainweb: {
    chains: 4,
    graph: {
      0: [1, 2],
      1: [0, 3],
      2: [0, 3],
      3: [1, 2],
    },
  },
}
```

### **What happens if I don’t specify a `graph` configuration?**

The plugin will automatically generate an optimal Pearson graph for standard configurations (2, 3, 10, or 20 chains).

### **How do I override Hardhat network settings for specific chain?**

You can define custom network configurations in `networks`:

```ts
networks: {
  // use different chain id anf gas price for chain 0 of hardhat chainweb
  chainweb_hardhat0: {
    chainId: 123,
    gasPrice: 0.1,
  },
}
```

### **Does this plugin support forking an existing network?**

You can use forking either via networkOptions property in the chianweb config or passing --fork to the command support it

```
npx hardhat node --frok https://THE_FORK_URL
```

using config

```ts
chainweb: {
  customGraphChainweb: {
    chains: 4,
    networkOptions: {
      forking:{
        url: "https://THE_FORK_URL"
      }
    }
  },
}
```

### **Does this plugin support deploying oversized contracts?**

Yes by adding `allowUnlimitedContractSize` to the networkOptions

```ts
chainweb: {
  customGraphChainweb: {
    chains: 4,
    networkOptions: {
      allowUnlimitedContractSize: true
    }
  },
}
```

## License

This project is licensed under the MIT License.

```

```
