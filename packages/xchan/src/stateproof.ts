import {
  Eip1193Provider,
  hexlify,
} from 'ethers';
import {
  MerkleLogProof,
} from './merklelog';
import { ElHeader } from './elheader';
import { ClBlockTag, createChainwebProof } from './clheader';
import { ChainId } from './xchan';


/* ************************************************************************** */
/* Chainweb Payload Hash Proof */

export async function stateRootProof(
  srcChainId: ChainId,
  trgChainId: ChainId,
  chainwebVersion: string,
  chainwebHost: string,
  blockTag: ClBlockTag,
  provider: Eip1193Provider,
): Promise<[MerkleLogProof, ElHeader]> {
  const [chainwebProof, clheader] = await createChainwebProof(
    chainwebVersion,
    chainwebHost,
    srcChainId,
    trgChainId,
    blockTag,
  );

  console.debug(`Add payload payload hash proof. chain: ${clheader.chainId}, height: ${clheader.height}, hash: ${hexlify(clheader.hash)}, payloadHash: ${hexlify(clheader.payloadHash)}`);
  const payloadHashProof = clheader.payloadHashProof().append(chainwebProof);

  // ideally we would query by block payload hash, but the JSON RPC of the EVM
  // does not support that.
  const elHeader = await ElHeader.request(provider, clheader.height);
  const stateRootProof = elHeader.stateRootProof();

  // combine the proofs
  console.debug(`Add state root proof. height: ${elHeader.number}, stateRoot: ${hexlify(elHeader.stateRoot)}, payloadHash: ${hexlify(elHeader.payloadHash)}`);
  return [stateRootProof.append(payloadHashProof), elHeader];
}
