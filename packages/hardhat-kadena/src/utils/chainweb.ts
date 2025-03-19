import { ethers } from 'ethers';
import { distance } from './chainweb-graph.js';
import { sleep } from './sleep.js';
import { wordToAddress } from './ethers-helpers.js';
import { logError, Logger, logInfo } from './logger.js';
import { ChainwebInProcessConfig } from '../type.js';
import { KadenaNetworkConfig, NetworksConfig } from 'hardhat/types';
import { Chain } from './chain.js';
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider.js';
import { getNetworkStem } from '../utils.js';

interface INetworkOptions {
  chainweb: ChainwebInProcessConfig;
  networks: NetworksConfig;
  chainwebName: string;
  overrideForking?: { url: string; blockNumber?: number };
}

export class ChainwebNetwork {
  private logger: Logger;
  public chains: Record<number, Chain>;
  public graph: Record<number, number[]>;

  constructor(private config: INetworkOptions) {
    this.logger = {
      info: (msg) => logInfo('reset', '-', msg),
      error: (msg) => logError('reset', '-', msg),
    };
    this.chains = makeChainweb(this.logger, this.config);
    this.graph = config.chainweb.graph;
  }

  getProvider(cid: number) {
    const chain = this.chains[cid];
    if (chain === undefined) {
      throw new Error(`Chain not found in Chainweb ${cid}`);
    }
    const provider = chain.provider;
    if (provider === null) {
      throw new Error(`Chain network is not running ${cid}`);
    }
    return provider;
  }

  async start() {
    try {
      this.logger.info('Starting chain networks');
      await Promise.all(
        Object.values(this.chains).map((chain) => {
          return chain.start();
        }),
      );
      this.logger.info('Chainweb chains initialized');
    } catch (e) {
      this.logger.error(`Failure while starting networks: ${e}, ${e.stack}`);
      await this.stop();
    }
  }

  async stop() {
    this.logger.info('Stopping chain networks');
    await Promise.all(Object.values(this.chains).map((chain) => chain.stop()));
    this.logger.info('Stopped chain networks');
  }

  // Mock getProof:
  //
  // Call our chainweb SPV api with the necesasry proof parameters.
  //
  // This mocks the call of the follwing API:
  //
  // http://localhost:1848/chainweb/0.0/evm-development/chain/${trgChain}/spv/chain/${origin.chain}/height/${origin.height}/transaction/${origin.txIdx}/event/${origin.eventIdx}
  //
  async getSpvProof(
    trgChain: number,
    origin: Omit<Origin, 'originContractAddress'>,
  ) {
    // get origin chain
    const provider = new HardhatEthersProvider(
      this.getProvider(Number(origin.chain)),
      `${getNetworkStem(this.config.chainwebName)}${origin.chain}`,
    );

    // Query Event information from origin chain
    const blockLogs = await provider.getLogs({
      fromBlock: origin.height,
      toBlock: origin.height,
    });

    const txLogs = blockLogs.filter(
      (l) => BigInt(l.transactionIndex) === origin.txIdx,
    );
    const log = txLogs[Number(origin.eventIdx)];
    if (log === undefined || log.removed) {
      new Error('No log entry found at origin');
    }

    const topics = log.topics;

    if (topics.length != 4) {
      throw new Error(
        `Expected exactly four topics at origin, but got ${topics.length}`,
      );
    }

    // for target chain to advance enough blocks such that the origin information
    // is available.
    //
    // TODO should fail at least once so that the caller has to wait?
    //
    const src = this.chains[Number(origin.chain)];
    const trg = this.chains[trgChain];
    if (src === undefined || trg === undefined) {
      throw new Error(`Chain not found in Chainweb`);
    }
    const dist = BigInt(distance(src.cid, trg.cid, this.graph));
    let trgHeight = BigInt(await trg.getBlockNumber());
    while (trgHeight < origin.height + dist) {
      console.log(
        `waiting for SPV proof to become available on chain ${trgChain}; current height ${trgHeight}; required height ${origin.height + dist}`,
      );
      await trg.mineRequest();
      sleep(100);
      trgHeight = BigInt(await trg.getBlockNumber());
    }

    const coder = ethers.AbiCoder.defaultAbiCoder();

    // FIXME: double check the event signature

    // (uint32,address,uint64,uint64,uint64)
    const xorigin = Object.values({
      chainId: origin.chain,
      address: log.address,
      height: origin.height,
      txIdx: origin.txIdx,
      eventIdx: origin.eventIdx,
    });

    // (uint32,address,uint64,(uint32,address,uint64,uint64,uint64))
    const xmsg = Object.values({
      trgChainId: ethers.toNumber(topics[1]),
      trgAddress: wordToAddress(topics[2]),
      opType: ethers.toNumber(topics[3]),
      data: coder.decode(['bytes'], log.data)[0],
      origin: xorigin,
    });

    const params =
      'tuple(uint32,address,uint64,bytes,tuple(uint32,address,uint64,uint64,uint64))';
    const payload = coder.encode([params], [xmsg]);
    const hash = ethers.keccak256(payload);

    return ethers.concat([hash, payload]);
  }
}

/* *************************************************************************** */
/* Chainweb Network */

function makeChainweb(
  logger: Logger,
  config: {
    chainweb: ChainwebInProcessConfig;
    networks: NetworksConfig;
    chainwebName: string;
    overrideForking?: { url: string; blockNumber?: number };
  },
) {
  const graph = config.chainweb.graph;
  const networks = config.networks;

  // Create Indiviual Chains
  logger.info('creating chains');
  const chains: Record<number, Chain> = {};
  for (const networkName in networks) {
    if (networkName.includes(getNetworkStem(config.chainwebName))) {
      const networkConfig = networks[networkName] as KadenaNetworkConfig;
      if (config.overrideForking?.url) {
        networkConfig.forking = { ...config.overrideForking, enabled: true };
      }

      chains[networkConfig.chainwebChainId!] = new Chain(
        networkConfig,
        config.chainweb.logging,
      );
    }
  }

  // Put Chains into the Chainweb Graph
  logger.info('integrating chains into Chainweb');
  for (const c in chains) {
    chains[c].adjacents = graph[c].map((x) => {
      const a = chains[x];
      if (a === undefined) {
        throw new Error(`Missing configuration for chain ${x}`);
      }
      return chains[x];
    });
  }
  return chains;
}

export interface Origin {
  chain: bigint;
  originContractAddress: string;
  height: bigint;
  txIdx: bigint;
  eventIdx: bigint;
}
