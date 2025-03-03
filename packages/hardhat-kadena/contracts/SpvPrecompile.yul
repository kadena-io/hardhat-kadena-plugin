object "Echo" {
  code {
    // Check that calldatasize is at least 32
    let size := calldatasize()
    if lt(size, 0x20) {
      revert(0,0)
    }

    // set proof data size
    let proof_size := sub(calldatasize(), 0x20)

    // read hash from calldata
    let expectedHash := calldataload(0x0)

    // Copy the proof data to free memory
    let offset := 0x80
    calldatacopy(offset, 0x20, proof_size)

    // compute hash of proof data
    let actualHash := keccak256(offset, proof_size)

    // enforce equal hashes
    if iszero(eq(expectedHash, actualHash)) {
      revert(0,0)
    }

    // Return the output buffer and its size
    return(offset, proof_size)
  }
}