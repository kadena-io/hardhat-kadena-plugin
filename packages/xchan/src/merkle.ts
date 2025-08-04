import { getBytes, ethers, BytesLike } from 'ethers';
import { uint16Le } from './utils';

/* ************************************************************************** */
/* Full Binary Merkle Tree*/

const TagInner = 0x0000;

export type MerkleHash = BytesLike;

// Use SHA256, because it is well supported in Ethereum Blake2b is a potential
// alternative with support in the EVM, but it uses 64 bits and might have worse
// performance in ZK proofs.
//
function merkleHash(bytes: MerkleHash): MerkleHash {
  return ethers.sha256(getBytes(bytes));
}

export function merkleNode(tag: number, bytes: BytesLike): MerkleHash {
  const tagged = ethers.concat([uint16Le(tag), getBytes(bytes)]);
  return merkleHash(tagged);
}

const emptyNode = merkleNode(TagInner, new Uint8Array());

function innerNode(left: MerkleHash, right: MerkleHash): MerkleHash {
  return merkleNode(TagInner, ethers.concat([getBytes(left), getBytes(right)]));
}

export function merkleRoot(nodes: MerkleHash[]): MerkleHash {
  const stack: MerkleHash[] = [];
  const m = Math.pow(2, Math.ceil(Math.log2(nodes.length)));
  for (let i = 0; i < m; i++) {
    stack.push(nodes[i] || emptyNode);
    let bits = i;
    while (bits % 2 === 1) {
      const right = stack.pop() as MerkleHash;
      const left = stack.pop() as MerkleHash;
      stack.push(innerNode(left, right));
      bits = Math.floor(bits / 2);
    }
  }
  return stack.pop() as MerkleHash;
}

// Create a Merkle proof for a set of leafs.
//
export function createMerkleProof(
  leafs: [MerkleHash, boolean][],
): [MerkleHash, MerkleProof] {
  const stack: [number, MerkleHash, boolean][] = [];
  const roots: MerkleHash[] = [];
  const remainingLeafs: [MerkleHash, boolean][] = leafs.slice();

  // compute the proof roots and the root
  while (true) {
    if (stack.length === 0 && remainingLeafs.length === 0) {
      throw new Error('XChanProof: proofs for empty trees are not supported');
    }

    // we are done!
    if (stack.length === 1 && remainingLeafs.length === 0) {
      // assert stack[0][2] === true;
      break;
    }
    if (stack.length > 1) {
      const [h0, n0, x0]: [number, MerkleHash, boolean] = stack.at(-1) as [
        number,
        MerkleHash,
        boolean,
      ];
      const [h1, n1, x1]: [number, MerkleHash, boolean] = stack.at(-2) as [
        number,
        MerkleHash,
        boolean,
      ];
      if (h0 === h1) {
        stack.pop();
        stack.pop();
        stack.push([h0 + 1, innerNode(n1, n0), x1 || x0]);
        if (x1 && !x0) {
          roots.push(n0);
        } else if (!x1 && x0) {
          roots.push(n1);
        }
        continue;
      }
    }
    if (remainingLeafs.length > 0) {
      const [leaf, included] = remainingLeafs.shift() as [MerkleHash, boolean];
      stack.push([0, leaf, included]);
      continue;
    } else {
      stack.push([0, emptyNode, false]);
      continue;
    }
  }
  return [
    stack[0][1] as MerkleHash,
    {
      roots: roots,
      leafs: leafs
        .filter((a) => a[1])
        .map((a, i) => [i, a[0]] as [number, MerkleHash]),
    },
  ];
}

export function runMerkleProof(proof: MerkleProof): MerkleHash {
  const roots = proof.roots.slice();
  const leafs = proof.leafs.slice();
  const stack: [number, MerkleHash][] = [];

  // Proof the subtree for a given leaf index/trace up to the the given height.
  //
  function go(
    mh: number, // height where to stop (when we have to start with the next leaf)
    n: number, // current trace
  ) {
    if (stack.length === 0) {
      // This can not happen: we never call 'go' with an empty stack. And
      // we only replace the top two elements of the stack with a new
      // element.
      throw new Error('runMerkleProof: impossible empty stack. This is a bug.');
    }

    // TODO instead of using the height, we could also compare the traces
    // directly.
    if (stack[0][0] === mh) {
      // target height reached, we move on
      return;
    }

    // TODO: this can be subsumed by the height test and move the
    // consistency check outside of go
    if (roots.length === 0 && stack.length === 1) {
      if (n === 0) {
        // we are done, the proof is valid
        return;
      } else {
        // we are not yet done, because the trace is not 0. But we have no roots
        // left, nothing to merge on the stack, and no additional leaves
        // available to join with at the curent height. So we are stuck.
        throw new Error('Invalid Merkle proof: no roots left to merge with.');
      }
    }

    const [sh0, s0] = stack.shift() as [number, MerkleHash];
    if (stack.length > 0 && sh0 === stack[0][0]) {
      // merge on stack to the left
      const s1 = (stack.shift() as [number, MerkleHash])[1];
      stack.unshift([sh0 + 1, innerNode(s1, s0)]);
      go(mh, n >> 1);
    } else if (roots.length > 0) {
      if (n % 2 === 1) {
        // merge with roots to the left
        const r0 = roots.shift() as MerkleHash;
        stack.unshift([sh0 + 1, innerNode(r0, s0)]);
        go(mh, n >> 1);
      } else {
        // merge with roots to the right
        const r0 = roots.shift() as MerkleHash;
        stack.unshift([sh0 + 1, innerNode(s0, r0)]);
        go(mh, n >> 1);
      }
    } else {
      // We need to merge with a root, but there are no roots left.
      throw new Error('Invalid Merkle proof: no roots left to merge with.');
    }
  }

  // Proof the subtree for the next leaf index up the height at which it does
  // not yet cover the next leaf index.

  while (leafs.length > 0) {
    const [lh0, l0] = leafs.shift() as [number, MerkleHash];
    stack.unshift([0, l0]);
    // go to the height where the next leaf is covered
    const h = Math.floor(
      Math.log2(lh0 ^ (leafs.length === 0 ? lh0 : leafs[0][0])),
    );
    go(h, lh0);
  }
  if (roots.length > 0) {
    // there are left over roots, the proof is malformed
    throw new Error(
      'Invalid Merkle proof: not enough roots to cover all leafs.',
    );
  }
  // we are done, the proof is valid
  return stack[0][1];
}

// The roots are in the order as they appear in the proof from left to right.
// The leaf indexes are their respective leaf positions in tree from left to
// right.
//
export type MerkleProof = {
  roots: MerkleHash[];
  leafs: [number, MerkleHash][];
};
