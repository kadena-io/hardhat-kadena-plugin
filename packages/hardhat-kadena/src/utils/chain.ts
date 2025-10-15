/* *************************************************************************** */
/* Chain */

import AsyncLock from 'async-lock';
import {
  CHAIN_ID_ADDRESS,
  CHAIN_ID_BYTE_CODE,
  CREATE2_FACTORY_ADDRESS,
  CREATE2_FACTORY_CODE,
  VERIFY_ADDRESS,
  VERIFY_BYTE_CODE,
} from './network-contracts.js';
import { EthereumProvider, KadenaNetworkConfig } from 'hardhat/types';
import { COLOR_PALETTE, logError, Logger, logInfo } from './logger.js';
import { createHardhatProvider } from './create-hardhat-provider.js';

const lock = new AsyncLock();

export class Chain {
  private config: KadenaNetworkConfig;
  private logger: Logger;
  private _adjacents: null | Chain[];
  private _provider: null | EthereumProvider;
  private autominer: null | NodeJS.Timeout;

  public get provider(): EthereumProvider {
    if (!this._provider) {
      throw new Error('Provider is not initialized');
    }
    return this._provider;
  }

  public set adjacents(adjacents: Chain[]) {
    this._adjacents = adjacents;
  }

  public get adjacents(): Chain[] {
    if (this._adjacents === null) {
      throw new Error('Chain is not part of a network');
    }
    return this._adjacents;
  }

  constructor(
    config: KadenaNetworkConfig,
    private logging: 'none' | 'info' | 'debug' = 'info',
  ) {
    const cid = config.chainwebChainId;
    this.config = config;

    this.logger = {
      info: (msg) =>
        logging !== 'none' ? logInfo(COLOR_PALETTE[cid % 6], cid, msg) : null,
      error: (msg) =>
        logging !== 'none' ? logError(COLOR_PALETTE[cid % 6], cid, msg) : null,
    };
    // set when the chain is added to the chainweb
    this._adjacents = null;

    // set when the ethers provider is created
    this._provider = null;

    // set when automining is enabled
    this.autominer = null;
  }

  get cid() {
    return this.config.chainwebChainId;
  }

  get url() {
    return '';
  }

  get port() {
    const url = new URL(this.url);
    return url.port ? parseInt(url.port, 10) : 8454;
  }

  async getBlockNumber() {
    // this.provider.getBlockNumber() is lagging. Maybe it caches internally or
    // there's a race in the implementation?
    // return await this.provider.getBlockNumber()
    return parseInt(await this.provider.send('eth_blockNumber', []), 16);
  }

  async makeBlock() {
    if (this.provider === null) {
      throw new Error('Provider is not initialized');
    }
    return await this.provider.send('evm_mine', []);
  }

  async mineRequest() {
    await lock.acquire('mine', async () => {
      this.logger.info(`mining requested`);
      await this.mine();
    });
  }

  async mine() {
    if (this.adjacents === null) {
      throw new Error('Chain is not part of a network');
    }
    const cn = await this.getBlockNumber();
    this.logger.info(`current height is ${cn}`);
    for (const a of this.adjacents) {
      const an = await a.getBlockNumber();
      if (an < cn) {
        await a.mine();
      }
    }
    this.logger.info(`make new block`);
    await this.makeBlock();
  }

  async hasPending() {
    const ps = await this.provider.send(
      'eth_getBlockTransactionCountByNumber',
      ['pending'],
    );
    return ps > 0;
  }

  async runPending() {
    const pending = await this.hasPending();
    if (pending) {
      await this.mineRequest();
    }
  }

  async initializeCidContract() {
    await this.provider.send('hardhat_setCode', [
      CHAIN_ID_ADDRESS,
      CHAIN_ID_BYTE_CODE,
    ]);
    const hex = '0x' + this.cid.toString(16).padStart(64, '0');
    await this.provider.send('hardhat_setStorageAt', [
      CHAIN_ID_ADDRESS,
      '0x0',
      hex,
    ]);
  }

  async initializeVerificationPrecompile() {
    await this.provider.send('hardhat_setCode', [
      VERIFY_ADDRESS,
      VERIFY_BYTE_CODE,
    ]);
  }

  async initializeCreate2Factory() {
    await this.provider.send('hardhat_setCode', [
      CREATE2_FACTORY_ADDRESS,
      CREATE2_FACTORY_CODE,
    ]);
  }

  async enableAutomine() {
    if (!this.autominer) {
      this.autominer = setInterval(() => this.runPending(), 100);
      this.logger.info(`Automine enabled`);
    }
  }

  async disableAutomine() {
    if (this.autominer) {
      clearInterval(this.autominer);
      this.autominer = null;
      this.logger.info(`Automine disabled`);
    }
  }

  async start() {
    // start hardhat network
    // await this.startHardhatNetwork();

    // create provider
    try {
      this._provider = await createHardhatProvider(this.config, this.logger);
      await this._provider.send('eth_accounts', []);
    } catch (e) {
      console.error(e);
    }

    // initialize system contracts
    await this.initializeCidContract();
    await this.initializeVerificationPrecompile();
    await this.initializeCreate2Factory();

    // setup automining
    await this.provider.send('evm_setAutomine', [false]);
    await this.enableAutomine();
  }

  async stop() {
    this.disableAutomine();
    this._provider = null;
  }
}
