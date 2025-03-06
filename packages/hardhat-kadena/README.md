# Hardhat Kadena chainweb Plugin

`@kadena/hardhat-chainweb` is a Hardhat plugin that allows developers to create a Kadena Chainweb EVM network, switch between chains, and request SPV proofs.

## What is Chainweb?

Chainweb is a blockchain architecture designed by Kadena, which features a parallelized Proof-of-Work (PoW) system. Instead of a single blockchain, Chainweb consists of multiple chains running in parallel, each processing transactions independently while being cryptographically linked to one another. This allows it to achieve high scalability and security without sacrificing decentralization.

## Installation

To install the plugin, run the following command:

```bash
npm install @kadena/hardhat-chainweb
```

## Build from Source

You can also build the plugin from source. To do this, first clone the repository and follow these steps:

**Note**: You need to have `pnpm` installed.

```bash
pnpm install
pnpm build
```

Once built, you can run the tests for the example project:

```bash
pnpm test
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
    hardhat:{
      chains: 3, // Number of chains in the Chainweb network
    },
  },
};
```

now run the normal hardhat command

```bash
# execute tests against inprocess hardhat chainweb
npx hardhat test
```

## Configuration

`chainweb` configuration follows the same pattern as networks sections, so you can add `hardhat` and any other custom chainweb if needed

```TS
type config = {
  chainweb: {
    hardhat: ChainwebUserConfig;
    [chainwebName: string]: ChainwebUserConfig;
  };
  defaultChainweb: string
}
```

- **hardhat**: this config uses the in-process hardhat network so its very fast for testing phase

- **custom name**: a part from hardhat and localhost you can add any other configuration based on your requirement.

## Setting the `defaultChainweb`

You can set the default chainweb by adding `defaultChainweb` to the hardhat config file. (default value is `hardhat`)

### Example of Setting defaultChainweb

```ts
module.exports = {
  ...,
  chainweb: {
    hardhat:{
      chains: 3, // Number of chains in the Chainweb network
    },
    localhost:{
      chains: 20
    }
  },
  defaultChainweb: "localhost"
};
```

You can override defaultChainweb by using `--chainweb` switch, which is available on the following commands

- node : `npx hardhat node --chainweb my-custom-chainweb`
- test : `npx hardhat test --chainweb localhost`
- run : `npx hardhat run ./scripts/my-script.js --chainweb hardhat`

each chainweb uses the following configuration options:

| Property          | Type                                                          | Description                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`        | `HardhatNetworkAccountsConfig` (optional)                     | Defines the accounts configuration for the network (default: Hardhat network accounts).                                                                                |
| `chains`          | `number`                                                      | Specifies the number of chains in the Chainweb network.                                                                                                                |
| `graph`           | `{ [key: number]: number[] }` (optional)                      | Defines the graph structure of the Chainweb network where keys represent chain IDs and values are arrays of connected chain IDs (default: Pearson graph).              |
| `type`            | `'in-process' \| 'external'` (optional)                       | Defines Chainweb type: “in-process” uses the Hardhat network, and “external” uses an external network (which you need to add to the networks—default: `'in-process'`). |
| `externalHostUrl` | `string` (optional)                                           | Defines the base url for external networks (default: `http://localhost:8545`)                                                                                          |
| `logging`         | `'none' \| 'info' \| 'debug'` (optional)                      | Sets the logging level for debugging purposes (default: `"info"`).                                                                                                     |
| `chainIdOffset`   | `number` (optional)                                           | chain id offset to be set (default: `626000`).                                                                                                                         |
| `precombiles`     | `{ chainwebChainId?: string, spvVerify?: string }` (optional) | if you are using external networks the precompile addresses might be different from the default ones so you can set them via this config                               |

## Graph Configuration

**note**: this is only for in-process networks

If you don’t provide a graph, the plugin automatically generates one for the chains using its built-in algorithm. Currently, it supports only 2, 3, 10, or 20 chains. If you need a different number of chains, you must explicitly pass the graph property

### Example Configuration

```ts
module.exports = {
  solidity: "0.8.20",
  chainweb: {
    hardhat:{
      chains: 4,
      graph: {
        0: [1,2,3]
        1: [0,2,3]
        2: [0,1,3]
        3: [0,1,2]
      }
    }
  },
};
```

## Networks

The plugin uses the Chainweb configuration and extends the Hardhat config by adding networks to it. the network names follow this pattern `chainweb_${chainwebName}${index}`;

e.g for `hardhat`: `chainweb_hardhat0`, `chainweb_hardhat1`

and for `custom_name`: `chainweb_custom_name0`, `chainweb_custom_name1`

All in-process networks inherit the built-in Hardhat network config by default, except:

- `chainId`: Replaced by `(chainIdOffset (default == 626000)) + chainIndex` (e.g., `626000, 626001, 626002, ...`).
- `chainwebChainId`: The chain index.
- `loggingEnabled`: `"true"` if the `logging` option is set to `"debug"` in the Chainweb config; otherwise, `"false"`.
- `accounts`: which comes from tha chainweb config if presented

### Override Network Configurations

If you want to override any option, you can add the network with the custom config in the `networks` section:

```ts
module.exports = {
  solidity: '0.8.20',
  networks: {
    chainweb_hardhat0: {
      chainId: 123, // Use custom chainId for chain 0
      gasPrice: 0.1, // set custom gas price
    },
  },
  chainweb: {
    hardhat: {
      chains: 2,
    },
  },
};
```

### Example of External Networks

Using the plugin to interact with external networks.

**Note**: The external network should implement the SPV proof endpoint with the following pattern.

```url
:externalHostUrl/:targetChain/spv/chain/:sourceChain/height/:height/transaction/:txIdx/event/:eventIdx
```

```ts
module.exports = {
  solidity: '0.8.28',
  // The plugin adds the following networks to the final config
  // networks: {
  //   chainweb_external0: {
  //     url: 'http://localhost:8545/chain/0',
  //     chainwebChainId: 0,
  //     chainId: 626000,
  //   },
  //   chainweb_external1: {
  //     url: 'http://localhost:8545/chain/1',
  //     chainwebChainId: 1,
  //     chainId: 626001,
  //   },
  // },
  chainweb: {
    external: {
      chains: 2,
      type: 'external',
      externalHostUrl: 'http://localhost:8545',
    },
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
  deployContractOnChains: (name: contract) => Promise<{
    deployments: {
      // ContractFactory from ethers
      contract: ReturnType<ContractFactory['deploy']>;
      address: string;
      chain: number;
      network: {
        name: string;
      };
    };
  }>;
  createTamperedProof: (targetChain: number, origin: Origin) => Promise<string>;
  computeOriginHash: (origin: Origin) => string;
  initialize: () => void;
}
```

| Function                 | Parameters                            | Return Type                                           | Description                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getProvider`            | `cid: number`                         | `HardhatEthersProvider`                               | Retrieves the provider for a specified chain.                                                                                                                                                                                                  |
| `requestSpvProof`        | `targetChain: number, origin: Origin` | `Promise<string>`                                     | Requests an SPV proof for a cross-chain transaction.                                                                                                                                                                                           |
| `switchChain`            | `cid: number`                         | `Promise<void>`                                       | Switches the active chain.                                                                                                                                                                                                                     |
| `getChainIds`            | None                                  | `number[]`                                            | Returns an array of available chain IDs.                                                                                                                                                                                                       |
| `callChainIdContract`    | None                                  | `Promise<number>`                                     | Calls a contract to get the chain ID.                                                                                                                                                                                                          |
| `deployContractOnChains` | `name: string`                        | check `deployContractOnChains` of `ChainwebPluginApi` | Deploys a contract on multiple chains.                                                                                                                                                                                                         |
| `createTamperedProof`    | `targetChain: number, origin: Origin` | `Promise<string>`                                     | Creates a tampered SPV proof for testing purposes.                                                                                                                                                                                             |
| `computeOriginHash`      | `origin: Origin`                      | `string`                                              | Computes the hash of a transaction origin.                                                                                                                                                                                                     |
| `initialize`             | None                                  | void                                                  | This function is called internally when using `node`, `test`, `run` command, so you mostly dont need it, However if you need to use the plugin in other command (e.g developing another plugin on top of this ) then you can call the function |

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

http://127.0.0.1:8545/chain/:targetChain/spv/chain/:sourceChain/height/:height/transaction/:txIdx/event/:eventIdx

### Example SPV proof request:

http://127.0.0.1:8545/chain/1/spv/chain/0/height/1234/transaction/16666/event/1123123123

## Tasks

the plugin uses standard hardhat tasks however it adds one more task to the hardhat.

- print-config: print the final configuration; this is useful for debugging since the plugin adds the networks to the final config

```bash
npx hardhat print-config
```

## Features

- Create a Chainweb network with configurable chain count and graph structure.
- Spin up and Switch between chains seamlessly.
- Request SPV proofs for cross-chain transactions.
- Configure logging levels for better debugging.
- Uses the Hardhat in-process network internally and creates multiple instances of it.
- Expose RPC server via http and websocket
- Support external chainweb configuration
- Support multiple chainwebs configuration

## Future Works

- Support chainweb docker compose

## License

This project is licensed under the MIT License.
