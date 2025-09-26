# Hardhat3 Kadena chainweb Plugin

`@kadena/hardhat3-chainweb` is a Hardhat3 plugin that allows Ethereum developers to create a Kadena Chainweb EVM network, connect to chains, and request SPV proofs.

## What is Chainweb?

Chainweb is a blockchain architecture designed by Kadena, which features a parallelized Proof-of-Work (PoW) system. Instead of a single blockchain, Chainweb consists of multiple chains running in parallel, each processing transactions independently while being cryptographically linked to one another. This allows it to achieve high scalability and security without sacrificing decentralization.

## Features

- 🔗 Multi-chain network simulation
- 🔘 Multiple chainweb configuration support
- 🔌 Support for both edr-simulated and http networks
- 🔀 Support forks

## Coming soon

- 🛠 deploy contracts on all chains
- 🔄 Cross-chain transaction support
- ✅ SPV proof generation and verification
- 📡 RPC server with HTTP and WebSocket support

## Installation (NOT AVAILABLE YET)

```bash
npm install @kadena/hardhat3-chainweb
# or
yarn add @kadena/hardhat3-chainweb
# or
pnpm install @kadena/hardhat3-chainweb
```

## Quick Start

1. Import the plugin in your `hardhat.config.ts`:

```typescript
import chainwebPlugin from '@kadena/hardhat3-chainweb';
```

2. Add basic configuration:

```typescript
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  solidity: {
    profiles: {
      default: {
        version: '0.8.28',
      },
    },
  },
  chainweb: {
    hardhat: {
      chains: 3, // Creates a 3-chain network
    },
  },
};

export default config;
```

3. Run your tests:

```bash
npx hardhat test
```

4. Run your script against localhost

```bash
npx hardhat run ./scripts/my-scripts.js --chainweb localhost
```

## Configuration Guide

```TS
interface HardhatChainwebUserConfig extends HardhatUserConfig {
  chainweb: {
      hardhat?: ChainwebInProcessUserConfig;
      localhost?: ChainwebExternalUserConfig;
      [chainwebName: string]: ChainwebUserConfig | undefined;
    };
    defaultChainweb?: string;
}

interface ChainwebUserConfig {
  chains: number;                          // Number of chains (2, 3, 10, or 20 for auto-graph)
  graph?: Record<number, number[]>;        // Custom chain connection graph
  type?: 'edr-simulated' | 'http';        // Network type (default: 'edr-simulated')
  chainIdOffset?: number;                  // Base network chain ID (default: 626000)
  chainwebChainIdOffset?: number;          // Base chainweb chain ID (default: 0)
  logging?: 'none' | 'info' | 'debug';     // Logging level
  accounts?: HardhatNetworkAccountsConfig; // Account configuration
  externalHostUrl?: string;                // For external networks
  precompiles?: {                          // Custom precompile addresses
    chainwebChainId?: string;              // chainweb chainId precompile address
    spvVerify?: string;                    // verify spv proof precompile address
  };
  networkOptions?:                         // override default values that created networks use
    | EdrNetworkUserConfig
    | HttpNetworkUserConfig
}



```

| Property                | Type                                                           | Description                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`              | `HardhatNetworkAccountsConfig` (optional)                      | Defines the accounts configuration for the network (default: Hardhat network accounts).                                                                                      |
| `chains`                | `number`                                                       | Specifies the number of chains in the Chainweb network.                                                                                                                      |
| `graph`                 | `{ [key: number]: number[] }` (optional)                       | Defines the graph structure of the Chainweb network where keys represent chain IDs and values are arrays of connected chain IDs (default: Pearson graph).                    |
| `type`                  | `'edr-simulated' \| 'http'` (optional)                         | Defines Chainweb type: “edr-simulated” uses the Hardhat network, and “external” uses an external network (which you need to add to the networks—default: `'edr-simulated'`). |
| `externalHostUrl`       | `string` (optional)                                            | Defines the base url for external networks (default: `http://localhost:8545`)                                                                                                |
| `logging`               | `'none' \| 'info' \| 'debug'` (optional)                       | Sets the logging level for debugging purposes (default: `"info"`).                                                                                                           |
| `chainIdOffset`         | `number` (optional)                                            | network chain id offset (default: `626000`).                                                                                                                                 |
| `chainwebChainIdOffset` | `number` (optional)                                            | chainweb chain id offset (default: `0`).                                                                                                                                     |
| `precompiles`           | `{ chainwebChainId?: string, spvVerify?: string }` (optional)  | if you are using external networks the precompile addresses might be different from the default ones so you can set them via this config                                     |
| `networkOptions`        | `HardhatNetworkUserConfig \| HttpNetworkUserConfig` (optional) | You can override any option that hardhat adds by default for the created networks. check the examples                                                                        |

### Network Types

#### 1. edr-simulated Network (Default)

Best for development and testing. Uses Hardhat's built-in network.

```typescript
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    hardhat: {
      chains: 3,
      type: 'edr-simulated', // this is the default value and can be skipped
    },
  },
};

export default config;
```

#### 2. External Network

For connecting to existing Chainweb networks.

```typescript
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    // the external chainweb name can be anything except 'localhost' or `hardhat`
    testnet: {
      type: 'http',
      chains: 2,
      externalHostUrl: 'http://testnet.your-domain.org',
      precompiles: {
        chainwebChainId: '0x0000000000000000000000000000000000000100',
        spvVerify: '0x0000000000000000000000000000000000000101',
      },
    },
  },
};
export default config;
```

### Setting the Default Chainweb

You can set the default chainweb by adding `defaultChainweb` to the hardhat config file. (default value is `hardhat`)

### Example of Setting Default Chainweb

```ts
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    hardhat: {
      chains: 3, // Number of chains in the Chainweb network
    },
    // this is using 20 edr-simulated chains
    myChainweb: {
      chains: 20,
    },
  },
  defaultChainweb: 'myChainweb',
};
```

### Chain Graph Configuration

The chain graph defines how chains are connected. For standard configurations (2, 3, 10, or 20 chains), the plugin automatically generates an optimal Pearson graph. For custom configurations, you must specify the graph manually.

```typescript
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    // this config uses 4 edr-simulated chains.
    custom_graph: {
      chains: 4,
      graph: {
        0: [1, 2], // Chain 0 connects to chains 1 and 2
        1: [0, 3], // Chain 1 connects to chains 0 and 3
        2: [0, 3], // Chain 2 connects to chains 0 and 3
        3: [1, 2], // Chain 3 connects to chains 1 and 2
      },
    },
  },
};
```

### Chain IDs and Networking

The plugin uses the Chainweb configuration and extends the Hardhat config by adding networks to it.

- Each chain gets a unique network chain ID: `chainIdOffset + chainIndex`. This is akin to the Ethereum network chain Id of 1.
- Default offset is 626000 (e.g., Chain 0 = 626000, Chain 1 = 626001)
- Network names follow the pattern: `chainweb_${networkName}${chainIndex}`

### Override Network Configurations

#### Override the config for all chains created for a chainweb

If you want to override any option, you can use networkOptions the custom network config

```ts
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    hardhat: {
      chains: 2,
      // the two created networks use the following config
      networkOptions: {
        gasPrice: 0.1,
        allowUnlimitedContractSize: true,
        forking: {
          url: 'http://the-fork-url',
        },
      },
    },
  },
};
```

#### Override the config a specific chain of the chainweb

You also can override the config for a specific chain. You just need to add the config in networks section.

```ts
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  networks:{
    // when you want only the chain 0 of chainweb, use the following config
    chainweb_hardhat0:{
      gasPrice: 0.1,
      allowUnlimitedContractSize: true,
      forking: {
        url: 'http://the-fork-url',
      },
    }
  }
  chainweb: {
    hardhat: {
      chains: 2,
    },
  },
};
```

## API Reference

### Hardhat Runtime Environment Extensions

The plugin adds a `chainweb` property to the Hardhat Runtime Environment (HRE):

```ts
interface ChainwebPluginApi {
  connect: (options: { cwId: number }) => Promise<NetworkConnection<'generic'>>;
  getCwChainIds: () => number[];
}
```

### Example

```TS
import { chainweb } from "hardhat"
const { ethers } = chainweb.connect({ cwId: 20 }) // get the connection to chain 20
```

## Precompiles

The edr-simulated chainweb comes with two `precompiles` that the addresses are accessible via `hre.config.chainweb[config_name].precompiles`.

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

## Tasks

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

- [TypeScript example project](./)

## FAQ

### **Why Adding Custom Chainwebs**

You likely add external chainwebs for targeting different networks. like one for tesnet, mainnet or devnet and etc

```typescript
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    // testing external dev-net
    devnet: {
      type: 'http',
      chains: 20,
      externalHostUrl: 'http://localhost:1234',
    },
    // this network is not available yet
    testnet: {
      type: 'http',
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

You can use several "edr-simulated" chainweb config for testing your smart contract behavior against different chain numbers or graphs or any other configuration

```typescript
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    // use 2 chains for regular development so tests run fast
    hardhat: {
      chains: 2,
    },
    // use 20 chains with a custom graph that is close to testnet
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
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
  chainweb: {
    // this config uses 4 edr-simulated chains.
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

### **How to use advanced hardhat configs**

All edr-simulated networks inherit the default hardhat network configuration so if for example you want to set `allowUnlimitedContractSize` you just need to add it to the config

```typescript
const config: HardhatUserConfig = {
  plugins: [chainwebPlugin],
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

### **What is the difference between `edr-simulated` and `http` Chainweb types?**

- **`edr-simulated`**: Runs Chainweb as part of Hardhat's local network, ideal for development and testing.
- **`http`**: Connects to an existing Chainweb network (e.g., testnet or mainnet) using an http RPC.

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
