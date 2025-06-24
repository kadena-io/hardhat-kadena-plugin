object "Echo" {
  code {
    function takenbits(offset, nbits) -> v {
      v := calldataload(offset)
      if shr(nbits, v) {
        revert(0, 0)
      }
    }

    // amount (32 bytes)
    // claim:
    // version (2 byte), tgt chain (4 bytes), tgt acct (2 byte # of u256's, followed by u256's), balance (32 bytes)
    // evidence:
    // target block hash (32 bytes), xchan id (32 bytes), signature of fixed key for now (65 bytes)

    let amount := takenbits(0x0, mul(0x32, 0x8))
    let version := takenbits(0x1, mul(0x2, 0x8))
    let tgt_chain := takenbits(0x2, mul(0x4, 0x8))
    let bal := takenbits(0x3, mul(0x32, 0x8))
    // we expect a 20-byte address in the tgt_acct
    let tgt_acct_len := takenbits(0x4, mul(0x2, 0x8))
    if not(eq(tgt_acct_len, 0x1)) {
      revert(0, 0)
    }
    let tgt_acct_off := 0x5
    let tgt_acct_address := takenbits(tgt_acct_off, mul(0x20, 0x8))
    let blkhash := takenbits(add(tgt_acct_off, tgt_acct_len), mul(0x32, 0x8))
    let xchanid := takenbits(add(tgt_acct_off, add(tgt_acct_len, 0x1)), mul(0x32, 0x8))
    let sig_dword1 := takenbits(add(tgt_acct_off, add(tgt_acct_len, 0x2)), mul(0x32, 0x8))
    let sig_dword2 := takenbits(add(tgt_acct_off, add(tgt_acct_len, 0x3)), mul(0x32, 0x8))
    let sig_finalbyte := takenbits(add(tgt_acct_off, add(tgt_acct_len, 0x4)), mul(0x1, 0x8))

    // check the chain ID matches
    let chainweb_chain_id := 0x9b02c3e2df42533e0fd166798b5a616f59dbd2cc
    let chain_id_offset := 0x0
    // 4 bytes in a chain id
    if iszero(staticcall(gas(), chainweb_chain_id, 0, 0, chain_id_offset, 0x4)) {
      revert(0, 0)
    }
    let actual_chain_id := mload(chain_id_offset)
    if not(eq(actual_chain_id, tgt_chain)) {
      revert(0, 0)
    }

    // hash message to check signature
    let message_offset := 0x0
    mstore(message_offset, version)
    mstore(add(message_offset, 1), tgt_chain)
    mstore(add(message_offset, 2), bal)
    calldatacopy(add(message_offset, 3), tgt_acct_off, tgt_acct_len)
    mstore(add(message_offset, add(3, tgt_acct_len)), blkhash)
    mstore(add(message_offset, add(3, add(tgt_acct_len, 1))), xchanid)

    // signature check
    let actual_hash := keccak256(message_offset, add(3, add(tgt_acct_len, 1)))
    let address_offset := 0x0
    let ecrecover := 0x01
    let in_offset := 0x20
    mstore(in_offset, actual_hash)
    mstore(add(in_offset, 1), sig_dword1)
    mstore(add(in_offset, 2), sig_dword2)
    mstore(add(in_offset, 3), sig_finalbyte)
    let out_offset := add(in_offset, add(65, 32))
    if iszero(staticcall(gas(), ecrecover, in_offset, 65, out_offset, 20)) {
      revert(0, 0)
    }
    let recovered_address := mload(out_offset)
    // let redeem_private_key := '0xef69d5fcb4e94dd638d7fe71cb4da99a679bb817ca706340b3901c1139f50a90'
    // let redeem_public_key := '0x02d33118ef4a40a2bd797daf61e71488d465b1174c11ae582abfd2ce1c77d0a2a4'
    let redeem_address := 0xaD9923C37370BCbCF00ed194506D895084895696
    if iszero(eq(recovered_address, redeem_address)) {
      revert(0, 0)
    }

    // update the channel state
    let current_chan_state := sload(xchanid)
    let max_transfer_amt := sub(bal, current_chan_state)
    if not(or(lt(amount, max_transfer_amt), eq(amount, max_transfer_amt))) {
      revert(0, 0)
    }
    sstore(xchanid, add(current_chan_state, amount))

    // execute the transfer
    if iszero(call(gas(), tgt_acct_address, amount, 0, 0, 0, 0)) {
      revert(0, 0)
    }

    return(0, 0)
  }
}
