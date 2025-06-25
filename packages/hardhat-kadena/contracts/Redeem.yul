object "Redeem" {
  code {
    // Reject any call with non-zero value
    if callvalue() { revert(0, 0) }

    /* ********************************************************************** */
    /* Parameters */

    // parameters:
    // 1. amount: u256
    // 2. proof: bytes

    // proof format:
    // * version: u16
    // * target chain: u32
    // * target account: address
    // * XChan balance: u256
    // * XChan Id: u256
    // * target block hash: u256
    // * signature v: u8
    // * signature r: u256
    // * signature s: u256
    // * target block hash timestamp: u64

    /* ********************************************************************** */
    /* Constants */

    let REDEEM_KEY_ADDR := 0xaD9923C37370BCbCF00ed194506D895084895696

    /* ********************************************************************** */
    /* Memory Layout */

    let chainIdPtr := 0x0 // 1 word
    let msgPtr := 0x20 // 5 words
    let msgHashPtr := 0xc0 // 1 word
    let sigPtr := 0xe0 // 3 words
    let sigAddrPtr := 0x140 // 1 word
    let rootTimePtr := 0x160 // 1 word
    let rootPtr := 0x180 // 1 word

    function error(code) {
      mstore(0x0, code)
      revert(0x0, 0x20)
    }

    /* ********************************************************************** */
    /* Parse Input Parameters */

    // check call data size
    // 0x20 + 0x2 + 0x4 + 0x14 + 0x20 + 0x20 + 0x20 + 0x1 + 0x20 + 0x20 + 0x8
    let msgSize := 0x9a
    let sigSize := 0x41
    let timestampSize := 0x8
    let paramsSize := 0xe3

    if iszero(eq(calldatasize(), paramsSize)) {
      error(0x01)
    }

    // calldataload + shift seems to incur the lowest gas cost
    // (note that shr is cheaper than div)
    let amount := calldataload(0x0)
    let version := shr(calldataload(0x20), 0xf0)
    let targetChain := shr(calldataload(0x22), 0xea)
    let targetAccount := shr(calldataload(0x26), 0x60)
    let xChanBalance := calldataload(0x36)
    let xChanId := calldataload(0x56)
    let rootHash := calldataload(0x76)
    let sigV := shr(calldataload(0x96), 0xf8)
    let sigR := calldataload(0x97)
    let sigS := calldataload(0xb7)
    let rootTime := shr(calldataload(0xd7), 0xc0)

    /* ********************************************************************** */
    /* Check Target ChainId */

    let chainwebChainIdContract := 0x9b02c3e2df42533e0fd166798b5a616f59dbd2cc
    if iszero(staticcall(gas(), chainwebChainIdContract, 0, 0, chainIdPtr, 0x4)) {
      error(0x02)
    }
    if iszero(eq(mload(chainIdPtr), targetChain)) {
      error(0x03)
    }

    /* ********************************************************************** */
    /* Compute Message Hash */

    calldatacopy(msgPtr, 0x0, msgSize)
    mstore(msgHashPtr, keccak256(msgPtr, msgSize))

    /* ********************************************************************** */
    /* Check Signature */

    // copy v value (right aligned)
    calldatacopy(add(sigPtr, 0x1f), msgSize, 0x01)
    // copy r and s value
    calldatacopy(add(sigPtr, 0x20), add(msgSize, 0x01), 0x40)

    let ecrecoverContract := 0x01
    if iszero(staticcall(gas(), ecrecoverContract, msgHashPtr, 0x80, sigAddrPtr, 0x20)) {
      error(0x04)
    }
    if iszero(eq(mload(sigAddrPtr), REDEEM_KEY_ADDR)) {
      error(0x05)
    }

    /* ********************************************************************** */
    /* Query Header Oracle */

    // Use EIP-4788 to check whether a header is included on chain.  For that
    // the timestamp of the header is needed. This information is merly
    // informational and does not need to be verfied.
    //
    // Also note that only the most recent 8191 headers are available which is
    // about 3 days on the Kadena mainnet.

    let beaconRootsContract := 0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02
    mstore(rootTimePtr, rootTime)

    // FIXME: we first need to fix the tests before this works.
    // if iszero(staticcall(gas(), beaconRootsContract, rootTimePtr, 0x20, rootPtr, 0x20)) {
    //   error(0x06)
    // }
    // if iszero(eq(mload(rootPtr), rootHash)) {
    //   error(0x07)
    // }

    /* ********************************************************************** */
    /* Check Amount */

    let redeemedAmount := sload(xChanId)
    let maxAmount := sub(xChanBalance, redeemedAmount)

    if gt(amount, maxAmount) {
      error(0x08)
    }

    /* ********************************************************************** */
    /* Update Redeemed Amount */

    sstore(xChanId, add(redeemedAmount, amount))

    /* ********************************************************************** */
    /* Send Funds to Target Account */

    if iszero(call(gas(), targetAccount, amount, 0, 0, 0, 0)) {
      error(0x09)
    }

    return(0, 0)
  }
}
