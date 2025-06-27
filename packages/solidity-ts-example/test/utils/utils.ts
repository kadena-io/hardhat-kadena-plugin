import { DeployedContractsOnChains } from '@kadena/hardhat-chainweb';
import { HardhatEthersHelpers } from 'hardhat/types';

import { chainweb, ethers } from 'hardhat';
import { SimpleToken } from '../../typechain-types';

const { requestSpvProof, deployContractOnChains, switchChain } = chainweb;

// hash of CrossChainInitialized(uint32,address,uint64,bytes)
const EVENT_SIG_HASH =
  '0x9d2528c24edd576da7816ca2bdaa28765177c54b32fb18e2ca18567fbc2a9550';

export async function authorizeAllContracts(
  deployments: Array<{
    chain: number | string;
    contract: SimpleToken;
    address: string;
  } & Partial<DeployedContractsOnChains>>
) {
  // For each chain, authorize all other chains as cross-chain peers
  for (const deployment of deployments) {
    await chainweb.switchChain(deployment.chain);
    const { deployer: owner } = await getSigners(deployment.chain);
    for (const target of deployments) {
      if (target.chain !== deployment.chain) {
        const tx = await deployment.contract.connect(owner)
          .setCrossChainAddress(target.chain, target.address);
        await tx.wait();
        const setAddr = await deployment.contract.getCrossChainAddress(target.chain);
        console.log(`Set cross-chain address for chain ${deployment.chain} -> ${target.chain}: ${setAddr}`);
      }
    }
  }
}

// Authorize contracts for cross-chain transfers to and from the token
export async function authorizeContracts(
  token: SimpleToken,
  tokenInfo: DeployedContractsOnChains,
  authorizedTokenInfos: [DeployedContractsOnChains, DeployedContractsOnChains],
) {
  await switchChain(tokenInfo.chain);
  for (const tok of authorizedTokenInfos) {
    console.log(
      `Authorizing ${tok.chain}:${tok.address} for ${tokenInfo.chain}:${tokenInfo.address}`,
    );
    const tx = await token.setCrossChainAddress(tok.chain, tok.address);
    await tx.wait();
  }
}

export function deployMocks(ownerAddress) {
  return deployContractOnChains({
    name: 'WrongOperationTypeToken',
    constructorArgs: [ethers.parseUnits('1000000'), ownerAddress],
  });
}

/* *************************************************************************** */
/* Initiate Cross-Chain Transfer */

export async function initCrossChain(
  sourceToken: SimpleToken,
  sourceTokenInfo: DeployedContractsOnChains,
  targetTokenInfo: DeployedContractsOnChains,
  sender: HardhatEthersSigner,
  receiver: HardhatEthersSigner,
  amount: bigint,
) {
  console.log(
    `Initiating cross-chain transfer from ${sourceTokenInfo.network.name} to ${targetTokenInfo.network.name}`,
  );
  await switchChain(sourceTokenInfo.chain);

  const response1 = await sourceToken
    .connect(sender)
    .transferCrossChain(receiver.address, amount, targetTokenInfo.chain);
  const receipt1 = await response1.wait();
  if (receipt1 === null) {
    throw new Error(`transfer-crosschain failed "receipt is null"`);
  }
  console.log(
    `transfer-crosschain status: ${receipt1.status}, at block number ${receipt1.blockNumber} with hash ${receipt1.hash}`,
  );

  // Compute origin
  const logIndex = receipt1.logs.findIndex(
    (log) => log.topics[0] == EVENT_SIG_HASH,
  );
  console.log(`found log at tx ${receipt1.index} and event ${logIndex}`);
  return {
    chain: BigInt(sourceTokenInfo.chain),
    originContractAddress: sourceTokenInfo.address,
    height: BigInt(receipt1.blockNumber),
    txIdx: BigInt(receipt1.index),
    eventIdx: BigInt(logIndex),
  };
}

// Redeem cross-chain transfer tokens
export async function redeemCrossChain(
  targetToken: SimpleToken,
  targetTokenInfo: DeployedContractsOnChains,
  receiver: HardhatEthersSigner,
  amount: bigint,
  proof: string,
) {
  await switchChain(targetTokenInfo.chain);
  console.log(`Redeeming tokens on chain ${targetTokenInfo.network.name}`);
  const response2 = await targetToken.redeemCrossChain(
    receiver.address,
    amount,
    proof,
  );
  const receipt2 = await response2.wait();
  if (receipt2 === null) {
    throw new Error(`transfer-crosschain failed "receipt is null"`);
  }
  console.log(`result at block height ${receipt2.blockNumber} received`);
}

// Make a cross-chain transfer
export async function crossChainTransfer(
  sourceToken: SimpleToken,
  sourceTokenInfo: DeployedContractsOnChains,
  targetToken: SimpleToken,
  targetTokenInfo: DeployedContractsOnChains,
  sender: HardhatEthersSigner,
  receiver: HardhatEthersSigner,
  amount: bigint,
) {
  console.log(
    `Transfering ${amount} tokens from ${sourceTokenInfo.chain}:${sourceTokenInfo.address}:${sender.address} to ${targetTokenInfo.chain}:${targetTokenInfo.address}:${receiver.address}`,
  );
  const origin = await initCrossChain(
    sourceToken,
    sourceTokenInfo,
    targetTokenInfo,
    sender,
    receiver,
    amount,
  );
  const proof = await requestSpvProof(targetTokenInfo.chain, origin);
  await redeemCrossChain(targetToken, targetTokenInfo, receiver, amount, proof);
}

export const CrossChainOperation = {
  None: 0,
  Erc20Transfer: 1,
  Erc20TransferFrom: 2,
};

export const getSigners = async (chainId) => {
  await chainweb.switchChain(chainId);

  const [deployer, alice, bob, carol] = await ethers.getSigners();
  return {
    deployer,
    alice,
    bob,
    carol,
  };
}

export type HardhatEthersSigner = Awaited<
  ReturnType<HardhatEthersHelpers['getSigner']>
>;

export type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  carol: HardhatEthersSigner;
};

export type DeployedContract = DeployedContractsOnChains['contract'];
