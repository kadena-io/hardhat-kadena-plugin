import type WsT from 'ws';

import http, { Server } from 'http';
import { Server as WSServer } from 'ws';
import { AddressInfo } from 'net';

import {
  EIP1193Provider,
  JsonRpcServer as IJsonRpcServer,
} from 'hardhat/types';

import { JsonRpcHandler } from 'hardhat/internal/hardhat-network/jsonrpc/handler';
import { pluginRouter } from './pluginRouter';
import picocolors from 'picocolors';

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

    this._httpServer = http.createServer();
    this._wsServer = new WSServer({
      server: this._httpServer,
    });

    this.configureRouters({
      httpServer: this._httpServer,
      wsServer: this._wsServer,
      handlers: config.providers.map(
        ([chainId, provider]) =>
          [chainId, new JsonRpcHandler(provider)] as const,
      ),
    });
  }

  public configureRouters({
    httpServer,
    wsServer,
    handlers,
  }: {
    httpServer: Server;
    wsServer: WsT.Server;
    handlers: Array<[number, JsonRpcHandler]>;
  }) {
    httpServer.on('request', async (req, res) => {
      pluginRouter.execute(
        req.url,
        {
          success: (msg, mimeType) => {
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(msg);
          },
          failure: (msg, code) => {
            res.writeHead(code);
            res.end(msg);
          },
          proxy: (handler) => {
            handler.handleHttp(req, res);
          },
        },
        {
          handlers,
        },
        'http',
      );
    });

    wsServer.on('connection', async (ws, request) => {
      pluginRouter.execute(
        request.url,
        {
          success: (msg) => {
            ws.send(msg);
          },
          failure: (error) => {
            ws.send(JSON.stringify({ error }));
          },
          proxy: (handler) => {
            handler.handleWs(ws);
          },
        },
        {
          handlers,
        },
        'ws',
      );
    });
  }

  public listen = (): Promise<{ address: string; port: number }> => {
    return new Promise((resolve, reject) => {
      const errorHandler = (err: Error) => {
        if ('code' in err) {
          console.log(
            picocolors.bgRedBright(` ${err.code} `),
            picocolors.redBright(err.message),
          );
          process.exit(1);
        } else {
          console.log(picocolors.redBright(err.message));
        }
        reject(err);
      };

      this._httpServer.on('error', errorHandler);
      this._wsServer.on('error', errorHandler);

      this._httpServer.listen(this._config.port, this._config.hostname, () => {
        // We get the address and port directly from the server in order to handle random port allocation with `0`.
        const address = this._httpServer.address() as AddressInfo; // TCP sockets return AddressInfo
        resolve(address);
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
