object "Redeem" {
  code {
    // Reject any call with non-zero value
    if callvalue() { revert(0, 0) }

    /* ********************************************************************** */
    /* Parameters */

    // parameters:
    // 1. requested amount: u256
    // 2. proof: bytes

    // Proof format:
    //
    // Message:
    // * version: u16
    // * target chain: u32
    // * target account: address
    // * XChan balance: u256
    // * XChan Id: u256
    // * target block hash: u256
    // Signature:
    // * signature v: u8
    // * signature r: u256
    // * signature s: u256
    // Auxiliary:
    // * target block hash timestamp: u64

    // NOTE: callers of this contract must make no assumptions about the length
    // of the proof. At the moment the proof size is constant, but this will
    // change in future versions.

    /* ********************************************************************** */
    /* Constants */

    // With this version proofs need to be signed. Future versions will not
    // require a signature.

    // THIS KEY IS ONLY FOR TESTING
    // THIS NEEDS TO BE CHANGED FOR PUBLIC TESTNET AND MAINNET
    // secret key: 0xef69d5fcb4e94dd638d7fe71cb4da99a679bb817ca706340b3901c1139f50a90
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
    let version := shr(0xf0, calldataload(0x20))
    let targetChain := shr(0xea, calldataload(0x22))
    let targetAccount := shr(0x60, calldataload(0x26))
    let xChanBalance := calldataload(0x3a)
    let xChanId := calldataload(0x5a)
    let rootHash := calldataload(0x7a)
    let sigV := shr(0xf8, calldataload(0x9a))
    let sigR := calldataload(0x9b)
    let sigS := calldataload(0xbb)
    let rootTime := shr(0xc0, calldataload(0xdb))

    /* ********************************************************************** */
    /* Check Version */

    if iszero(eq(version, 0x0)) {
      error(0x02)
    }

    /* ********************************************************************** */
    /* Check Target ChainId */

    let chainwebChainIdContract := 0x9b02c3e2df42533e0fd166798b5a616f59dbd2cc
    if iszero(staticcall(gas(), chainwebChainIdContract, 0, 0, chainIdPtr, 0x4)) {
      error(0x03)
    }
    if iszero(eq(mload(chainIdPtr), targetChain)) {
      error(0x04)
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
      error(0x05)
    }
    if iszero(eq(mload(sigAddrPtr), REDEEM_KEY_ADDR)) {
      error(0x06)
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
    if iszero(staticcall(gas(), beaconRootsContract, rootTimePtr, 0x20, rootPtr, 0x20)) {
      error(0x07)
    }
    if iszero(eq(mload(rootPtr), rootHash)) {
      error(0x08)
    }

    /* ********************************************************************** */
    /* Check Amount */

    let redeemedAmount := sload(xChanId)
    let maxAmount := sub(xChanBalance, redeemedAmount)

    if gt(amount, maxAmount) {
      error(0x09)
    }

    /* ********************************************************************** */
    /* Update Redeemed Amount */

    sstore(xChanId, add(redeemedAmount, amount))

    /* ********************************************************************** */
    /* Send Funds to Target Account */

    // TODO: is this safe or do we need to check first that there is no code
    // at the target account?
    if iszero(call(gas(), targetAccount, amount, 0, 0, 0, 0)) {
      error(0x0a)
    }

    return(0, 0)
  }
}
