import { JsonRpcHandler } from 'hardhat/internal/hardhat-network/jsonrpc/handler';
import { Router } from './utils/Route';

const router = new Router<
  {
    handlers: Array<[number, JsonRpcHandler]>;
  },
  JsonRpcHandler
>();

// SPV proof route
router.route(
  `/chain/:targetChain/spv/chain/:sourceChain/height/:height/transaction/:txIdx/event/:eventIdx`,
  async (
    { targetChain, sourceChain, height, txIdx, eventIdx },
    { success, failure },
  ) => {
    const hre = await import('hardhat');
    if (!targetChain || !sourceChain || !height || !txIdx || !eventIdx) {
      return failure('Invalid request', 400);
    }
    try {
      const proof = await hre.chainweb.requestSpvProof(parseInt(targetChain), {
        chain: BigInt(sourceChain),
        height: BigInt(height),
        txIdx: BigInt(txIdx),
        eventIdx: BigInt(eventIdx),
      });
      return success(proof, 'text');
    } catch (e) {
      console.log('SPV proof request failed', e);
      return failure('SPV proof request failed', 500);
    }
  },
);

// Chain route
router.route(
  `/chain/:chainId/evm/rpc`,
  ({ chainId }, { failure, proxy }, { handlers }) => {
    const handler = handlers.find(([id]) => parseInt(chainId) === id)?.[1];
    if (handler === undefined) {
      return failure(`chainweb index ${chainId} is not found`, 404);
    }
    return proxy(handler);
  },
);

export const pluginRouter = router;
