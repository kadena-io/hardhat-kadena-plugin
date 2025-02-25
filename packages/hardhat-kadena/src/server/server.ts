import type WsT from 'ws';

// import { Client } from 'undici';
import http, { Server } from 'http';
import { Server as WSServer } from 'ws';
import { AddressInfo } from 'net';

import {
  EIP1193Provider,
  JsonRpcServer as IJsonRpcServer,
} from 'hardhat/types';
// import { HttpProvider } from 'hardhat/internal/core/providers/http';

import { JsonRpcHandler } from 'hardhat/internal/hardhat-network/jsonrpc/handler';
import { parseSpvProofRequest, mapChainIdToRoute } from './utils';

const getRoute = (url: string | undefined) => {
  if (url !== undefined && url.startsWith('http')) {
    return new URL(url).pathname;
  }
  return url;
};

const log = (msg: string) => {
  console.log(msg);
};

export interface JsonRpcServerConfig {
  hostname: string;
  port: number;
  providers: [chainId: number, provider: EIP1193Provider][];
}

export class ChainwebJsonRpcServer implements IJsonRpcServer {
  private _config: JsonRpcServerConfig;
  private _httpServer: Server;
  private _wsServer: WsT.Server;

  constructor(config: JsonRpcServerConfig) {
    this._config = config;

    const handlers = config.providers.map(
      ([chainId, provider]) => [chainId, new JsonRpcHandler(provider)] as const,
    );

    this._httpServer = http.createServer();
    this._wsServer = new WSServer({
      server: this._httpServer,
    });

    this._httpServer.on('request', async (req, res) => {
      const hre = await import('hardhat');
      const route = getRoute(req.url);
      if (route?.match(/chain\/[0-9]+\/spv\//)) {
        try {
          const { targetChain, origin } = parseSpvProofRequest(route);
          const proof = await hre.chainweb.requestSpvProof(targetChain, origin);
          res.writeHead(200, { 'Content-Type': 'text' });
          res.end(proof);
          return;
        } catch (e) {
          res.writeHead(500);
          res.end(e.message);
          return;
        }
      }
      const handler = handlers.find(
        ([id]) => route === mapChainIdToRoute(id),
      )?.[1];
      if (handler === undefined) {
        console.log('404', route, handler);
        res.writeHead(404);
        res.end(`${route} is not a valid chain id`);
        return;
      }
      handler.handleHttp(req, res);
    });
    this._wsServer.on('connection', async (ws) => {
      const hre = await import('hardhat');
      const route = getRoute(ws.url);
      if (route?.match(/chain\/[0-9]+\/spv\//)) {
        try {
          const { targetChain, origin } = parseSpvProofRequest(route);
          const proof = await hre.chainweb.requestSpvProof(targetChain, origin);
          ws.send(proof);
          return;
        } catch (e) {
          ws.send(e?.message ?? 'Internal server error');
          return;
        }
      }
      const handler = handlers.find(
        ([id]) => route === mapChainIdToRoute(id),
      )?.[1];
      if (handler === undefined) {
        ws.close();
        return;
      }
      handler.handleWs(ws);
    });
  }

  public listen = (): Promise<{ address: string; port: number }> => {
    return new Promise((resolve) => {
      log(`Starting JSON-RPC server on port ${this._config.port}`);
      this._httpServer
        .listen(this._config.port, this._config.hostname, () => {
          // We get the address and port directly from the server in order to handle random port allocation with `0`.
          const address = this._httpServer.address() as AddressInfo; // TCP sockets return AddressInfo
          resolve(address);
        })
        .on('close', (err: unknown) => {
          console.error('HMM', err);
        });
    });
  };

  public waitUntilClosed = async () => {
    const httpServerClosed = new Promise((resolve) => {
      this._httpServer.once('close', resolve);
    });

    const wsServerClosed = new Promise((resolve) => {
      this._wsServer.once('close', resolve);
    });

    await Promise.all([httpServerClosed, wsServerClosed]);
  };

  public close = async () => {
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        log('Closing JSON-RPC server');
        this._httpServer.close((err) => {
          if (err !== null && err !== undefined) {
            log('Failed to close JSON-RPC server');
            reject(err);
            return;
          }

          log('JSON-RPC server closed');
          resolve();
        });
      }),
      new Promise<void>((resolve, reject) => {
        log('Closing websocket server');
        this._wsServer.close((err) => {
          if (err !== null && err !== undefined) {
            log('Failed to close websocket server');
            reject(err);
            return;
          }

          log('Websocket server closed');
          resolve();
        });
      }),
    ]);
  };
}
