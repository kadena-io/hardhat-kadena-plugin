const { chainweb, ethers } = require('hardhat');

const { requestSpvProof, switchChain, deployContractOnChains } = chainweb;

// hash of CrossChainInitialized(uint32,address,uint64,bytes)
const EVENT_SIG_HASH =
  '0x9d2528c24edd576da7816ca2bdaa28765177c54b32fb18e2ca18567fbc2a9550';

async function authorizeAllContracts(deployments) {
  // For each chain, authorize all other chains as cross-chain peers
  for (const deployment of deployments) {
    await chainweb.switchChain(deployment.chain);
    const signers = await getSigners(deployment.chain);
    const owner = signers.deployer;
    for (const target of deployments) {
      if (target.chain !== deployment.chain) {
        const tx = await deployment.contract
          .connect(owner)
          .setCrossChainAddress(target.chain, target.address);
        await tx.wait();
        const setAddr = await deployment.contract.getCrossChainAddress(
          target.chain,
        );
        console.log(
          `Set cross-chain address for chain ${deployment.chain} -> ${target.chain}: ${setAddr}`,
        );
      }
    }
  }
}

function deployMocks(ownerAddress) {
  return deployContractOnChains({
    name: 'WrongOperationTypeToken',
    constructorArgs: [ethers.parseUnits('1000000'), ownerAddress],
  });
}

/* *************************************************************************** */
/* Initiate KIP-34 Cross-Chain Transfer */

async function initCrossChain(
  sourceToken,
  sourceTokenInfo,
  targetTokenInfo,
  sender,
  receiver,
  amount,
) {
  console.log(
    `Initiating cross-chain transfer from ${sourceTokenInfo.network.name} to ${targetTokenInfo.network.name}`,
  );

  await switchChain(sourceTokenInfo.chain);
  let response1 = await sourceToken
    .connect(sender)
    .transferCrossChain(receiver.address, amount, targetTokenInfo.chain);
  let receipt1 = await response1.wait();
  console.log(
    `transfer-crosschain status: ${receipt1.status}, at block number ${receipt1.blockNumber} with hash ${receipt1.hash}`,
  );

  // Compute origin
  let logIndex = receipt1.logs.findIndex(
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
async function redeemCrossChain(
  targetToken,
  targetTokenInfo,
  receiver,
  amount,
  proof,
) {
  await switchChain(targetTokenInfo.chain);
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
async function crossChainTransfer(
  sourceToken,
  sourceTokenInfo,
  targetToken,
  targetTokenInfo,
  sender,
  receiver,
  amount,
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

const CrossChainOperation = {
  None: 0,
  Erc20Transfer: 1,
  Erc20TransferFrom: 2,
};

async function getSigners(chainId) {
  await chainweb.switchChain(chainId);

  const [deployer, alice, bob, carol] = await ethers.getSigners();
  return {
    deployer,
    alice,
    bob,
    carol,
  };
}

module.exports = {
  authorizeAllContracts,
  crossChainTransfer,
  initCrossChain,
  redeemCrossChain,
  CrossChainOperation,
  getSigners,
  deployMocks,
  requestSpvProof,
};
