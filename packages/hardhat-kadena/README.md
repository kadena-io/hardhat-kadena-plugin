# Hardhat Kadena Plugin

`@kadena/hardhat-chainweb` is a Hardhat plugin that allows developers to create a Chainweb network, switch between chains, and request SPV proofs.

## Installation

To install the plugin, run the following command

```bash
npm install @kadena/hardhat-chainweb
```

## Build from source

You can also build the plugin from source. To do this, first, clone the repository and follow these steps:

**Note**: You need to have `pnpm` installed.

```bash
pnpm install
cd packages/hardhat-kadena
pnpm build
```

Once built, you can run the tests for the example project:

```bash
cd ../solidity-example
pnpm hardhat test
```

## Usage

To use the plugin in your Hardhat project, import it in your Hardhat configuration file (`hardhat.config.ts` or `hardhat.config.js`):

```ts
import '@kadena/hardhat-chainweb';
```

Then, configure the plugin in the `hardhat.config.ts` file:

```ts
module.exports = {
  ...,
  chainweb: {
    chains: 3, // Number of chains in the Chainweb network
  },
};
```

## Configuration

The plugin uses the following configuration options:

| Property      | Type                                      | Description                                                                                                                                               |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `networkStem` | `string` (optional)                       | Specifies the network stem for Chainweb (default: `kadena_devnet_`).                                                                                      |
| `accounts`    | `HardhatNetworkAccountsConfig` (optional) | Defines the accounts configuration for the network (default: Hardhat network accounts).                                                                   |
| `chains`      | `number` (optional)                       | Specifies the number of chains in the Chainweb network (default: `2`).                                                                                    |
| `graph`       | `{ [key: number]: number[] }` (optional)  | Defines the graph structure of the Chainweb network where keys represent chain IDs and values are arrays of connected chain IDs (default: Pearson graph). |
| `logging`     | `"none" \| "info" \| "debug"` (optional)  | Sets the logging level for debugging purposes (default: `"info"`).                                                                                        |

## Graph

If you don’t provide a graph, the plugin automatically generates one for the chains using its built-in algorithm. Currently, it supports only 2, 3, 10, or 20 chains. If you need a different number of chains, you must explicitly pass the graph property

### Example Configuration

```ts
module.exports = {
  solidity: "0.8.20",
  chainweb: {
    chains: 4,
    graph: {
      0: [1,2,3]
      1: [0,2,3]
      2: [0,1,3]
      3: [0,1,2]
    }
  },
};
```

## Networks

The plugin uses the Chainweb configuration and extends the Hardhat config by adding networks to it. All networks inherit the built-in Hardhat network config by default, except:

- `chainId`: Replaced by `626000 + chainIndex` (e.g., `626000, 626001, 626002, ...`).
- `chainwebChainId`: The chain index.
- `loggingEnabled`: `"true"` if the `logging` option is set to `"debug"` in the Chainweb config; otherwise, `"false"`.

### Override Network Configurations

If you want to override any option, you can add the network with the custom config in the `networks` section:

```ts
module.exports = {
  solidity: '0.8.20',
  networks: {
    kadena_devnet_0: {
      chainId: 123, // Use custom chainId for chain 0
      gasPrice: 0.1, // set custom gas price
    },
  },
  chainweb: {
    chains: 2,
  },
};
```

## Plugin API

The plugin adds a `chainweb` property to the Hardhat Runtime Environment (HRE):

```ts
export interface ChainwebPluginApi {
  getProvider: (cid: number) => HardhatEthersProvider;
  requestSpvProof: (targetChain: number, origin: Origin) => Promise<string>;
  switchChain: (cid: number) => Promise<void>;
  getChainIds: () => number[];
  callChainIdContract: () => Promise<number>;
  deployContractOnChains: DeployContractOnChains;
  createTamperedProof: (targetChain: number, origin: Origin) => Promise<string>;
  computeOriginHash: (origin: Origin) => string;
  deployMocks: () => ReturnType<DeployContractOnChains>;
  network: ChainwebNetwork;
}
```

| Function                 | Parameters                            | Return Type                          | Description                                          |
| ------------------------ | ------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `getProvider`            | `cid: number`                         | `HardhatEthersProvider`              | Retrieves the provider for a specified chain.        |
| `requestSpvProof`        | `targetChain: number, origin: Origin` | `Promise<string>`                    | Requests an SPV proof for a cross-chain transaction. |
| `switchChain`            | `cid: number`                         | `Promise<void>`                      | Switches the active chain.                           |
| `getChainIds`            | None                                  | `number[]`                           | Returns an array of available chain IDs.             |
| `callChainIdContract`    | None                                  | `Promise<number>`                    | Calls a contract to get the chain ID.                |
| `deployContractOnChains` | Varies                                | `DeployContractOnChains`             | Deploys a contract on multiple chains.               |
| `createTamperedProof`    | `targetChain: number, origin: Origin` | `Promise<string>`                    | Creates a tampered SPV proof for testing purposes.   |
| `computeOriginHash`      | `origin: Origin`                      | `string`                             | Computes the hash of a transaction origin.           |
| `deployMocks`            | None                                  | `ReturnType<DeployContractOnChains>` | Deploys mock contracts for testing.                  |
| `network`                | None                                  | `ChainwebNetwork`                    | Provides access to the Chainweb network object.      |

For the spv proof you need to pass the origin with the following interface

```TS
export interface Origin {
  chain: bigint;
  originContractAddress: string;
  height: bigint;
  txIdx: bigint;
  eventIdx: bigint;
}
```

### Example

```TS
import { chainweb } from "hardhat"

await chainweb.deployContractOnChains("SimpleToken") // deploy contract on all chains
await chainweb.switchChain(0); // configure hardhat to use chain 0
```

### Overloading `hardhat-switch-network`

This plugin overrides `switchNetwork` from `hardhat-switch-network` to load the correct Chainweb provider while also supporting switching by chain index. For example, `switchNetwork(1)` switches to chain 1 of Chainweb.

## RPC Server

You can run Chainweb as a single node using the hardhat node command. This will spin up the chains based on the Chainweb configuration and expose both http and ws ports with URLs following this pattern. You can also pass standard Hardhat configuration options like hostname and port to change the default values. Note that fork is not supported yet.

### Chain URLs

http://127.0.0.1:8545/chain/chainIndex

### Example for multiple chains:

http://127.0.0.1:8545/chain/0
http://127.0.0.1:8545/chain/1

## SPV Proof Requests

The server also accepts requests for SPV proofs with the following URL pattern:

http://127.0.0.1:8545/chain/${trgChain}/spv/chain/${origin.chain}/height/${origin.height}/transaction/${origin.txIdx}/event/${origin.eventIdx}

### Example SPV proof request:

http://127.0.0.1:8545/chain/1/spv/chain/0/height/1234/transaction/16666/event/1123123123

## Features

- Create a Chainweb network with configurable chain count and graph structure.
- Spin up and Switch between chains seamlessly.
- Request SPV proofs for cross-chain transactions.
- Configure logging levels for better debugging.
- Uses the Hardhat in-process network internally and creates multiple instances of it.
- Expose RPC server via http and websocket

## Future Works

- Support external Chainweb configuration.
- Support chainweb docker compose

## License

This project is licensed under the MIT License.
