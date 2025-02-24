import { BytesLike } from 'ethers';
import { JsonRpcProvider, ethers } from 'ethers';

export const isValidProvider = (
  provider: JsonRpcProvider | undefined | null,
): provider is JsonRpcProvider => {
  if (!provider) {
    return false;
  }
  return provider.send !== undefined;
};

/* *************************************************************************** */
/* Ethers Provider */

export function getProvider(rpcUrl: string) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  provider.pollingInterval = 100;
  return provider as unknown as JsonRpcProvider;

  // would be nice to use this to subscribe to pending txs. But that seems to be
  // not reliable.
  // return new ethers.providers.WebSocketProvider(rpcUrl);
}

export function wordToAddress(hexbytes: BytesLike) {
  return ethers.getAddress(ethers.dataSlice(hexbytes, 12));
}
