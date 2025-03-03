const { switchNetwork, chainweb, network } = require('hardhat');

const { requestSpvProof, switchChain, deployContractOnChains } = chainweb;

// hash of CrossChainInitialized(uint32,address,uint64,bytes)
const EVENT_SIG_HASH =
  '0x9d2528c24edd576da7816ca2bdaa28765177c54b32fb18e2ca18567fbc2a9550';

// Authorize contracts for cross-chain transfers to and from the token
async function authorizeContracts(token, tokenInfo, authorizedTokenInfos) {
  console.log('tokenInfo', tokenInfo);
  await switchNetwork(tokenInfo.network.name);
  console.log('SWITCHED NETWORKS', network);
  for (const tok of authorizedTokenInfos) {
    console.log(
      `Authorizing ${tok.chain}:${tok.address} for ${tokenInfo.chain}:${tokenInfo.address}`,
    );
    const tx = await token.setCrossChainAddress(tok.chain, tok.address);
    await tx.wait();
  }
}

function deployMocks() {
  console.log(`Found Kadena devnet networks while deploying mocks`);
  return deployContractOnChains('WrongOperationTypeToken');
}

/* *************************************************************************** */
/* Initiate Cross-Chain Transfer */

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
    `Transfering ${amount} tokens from ${sourceTokenInfo.chain}:${sourceTokenInfo.address}:${sender.addresss} to ${targetTokenInfo.chain}:${targetTokenInfo.address}:${receiver.address}`,
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

async function getSigners() {
  await switchChain(0);
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  console.log({
    deployer: deployer.address,
    alice: alice.address,
    bob: bob.address,
    carol: carol.address,
  });
  return {
    deployer,
    alice,
    bob,
    carol,
  };
}

module.exports = {
  authorizeContracts,
  crossChainTransfer,
  initCrossChain,
  redeemCrossChain,
  CrossChainOperation,
  getSigners,
  deployMocks,
};
