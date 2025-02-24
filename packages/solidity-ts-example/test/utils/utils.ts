import { ethers } from 'hardhat';
import { DeployedContractsOnChains } from 'hardhat-kadena';
import { HardhatEthersHelpers } from 'hardhat/types';

const { switchNetwork, chainweb } = require('hardhat');

const { requestSpvProof, switchChain } = chainweb;

// hash of CrossChainInitialized(uint32,address,uint64,bytes)
const EVENT_SIG_HASH =
  '0x9d2528c24edd576da7816ca2bdaa28765177c54b32fb18e2ca18567fbc2a9550';

// Authorize contracts for cross-chain transfers to and from the token
export async function authorizeContracts(
  token: DeployedContract,
  tokenInfo: DeployedContractsOnChains,
  authorizedTokenInfos: [DeployedContractsOnChains, DeployedContractsOnChains],
) {
  await switchNetwork(tokenInfo.network.name);
  for (const tok of authorizedTokenInfos) {
    console.log(
      `Authorizing ${tok.chain}:${tok.address} for ${tokenInfo.chain}:${tokenInfo.address}`,
    );
    const tx = await token.setCrossChainAddress(tok.chain, tok.address);
    await tx.wait();
  }
}

/* *************************************************************************** */
/* Initiate Cross-Chain Transfer */

export async function initCrossChain(
  sourceToken: DeployedContract,
  sourceTokenInfo: DeployedContractsOnChains,
  targetTokenInfo: DeployedContractsOnChains,
  sender: HardhatEthersSigner,
  receiver: HardhatEthersSigner,
  amount: bigint,
) {
  console.log(
    `Initiating cross-chain transfer from ${sourceTokenInfo.network.name} to ${targetTokenInfo.network.name}`,
  );
  await switchNetwork(sourceTokenInfo.network.name);
  let response1 = await sourceToken
    .connect(sender)
    .transferCrossChain(receiver.address, amount, targetTokenInfo.chain);
  let receipt1 = await response1.wait();
  console.log(
    `transfer-crosschain status: ${receipt1.status}, at block number ${receipt1.blockNumber} with hash ${receipt1.hash}`,
  );

  // Compute origin
  let logIndex = receipt1.logs.findIndex(
    (log: any) => log.topics[0] == EVENT_SIG_HASH,
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
  targetToken: DeployedContract,
  targetTokenInfo: DeployedContractsOnChains,
  receiver: HardhatEthersSigner,
  amount: bigint,
  proof: string,
) {
  await switchNetwork(targetTokenInfo.network.name);
  console.log(`Redeeming tokens on chain ${targetTokenInfo.network.name}`);
  let response2 = await targetToken.redeemCrossChain(
    receiver.address,
    amount,
    proof,
  );
  let receipt2 = await response2.wait();
  console.log(
    `result at block height ${receipt2.blockNumber} received with status ${response2.status}`,
  );
}

// Make a cross-chain transfer
export async function crossChainTransfer(
  sourceToken: DeployedContract,
  sourceTokenInfo: DeployedContractsOnChains,
  targetToken: DeployedContract,
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

export async function getSigners() {
  await switchChain(0);
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

export type DeployedContract = any; // DeployedContractsOnChains["contract"];
