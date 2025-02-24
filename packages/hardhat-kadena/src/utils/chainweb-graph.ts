/* *************************************************************************** */
/* Compute Chain Distances */

// Compute shortest path via breadth first search. For small, connected,
// degree-diameter graphs this has acceptable performance. (well, it's bad, but
// not terribly bad)
//
export function distance(
  srcChain: number,
  trgChain: number,
  graph: Record<number, number[]>,
) {
  if (srcChain == trgChain) {
    return 0;
  }
  const visited = [srcChain];
  const queue = [[srcChain, 0] as [number, number]];

  while (queue.length > 0) {
    const [cur, d] = queue.shift()!;
    for (const adj of graph[cur]) {
      if (adj == trgChain) {
        return d + 1;
      }
      if (!visited.includes(adj)) {
        visited.push(adj);
        queue.push([adj, d + 1]);
      }
    }
  }
  throw new Error('Chain not found in Chainweb');
}

export function createGraph(chains: number = 2): Record<number, number[]> {
  switch (chains) {
    case 2:
      return {
        0: [1],
        1: [0],
      };
    case 3:
      return {
        0: [1, 2],
        1: [0, 2],
        2: [0, 1],
      };
    case 10:
      return {
        0: [3, 2, 5],
        1: [4, 3, 6],
        2: [0, 4, 7],
        3: [1, 0, 8],
        4: [2, 1, 9],
        5: [9, 6, 0],
        6: [5, 7, 1],
        7: [6, 8, 2],
        8: [7, 9, 3],
        9: [8, 5, 4],
      };
    case 20: {
      return {
        0: [5, 10, 15],
        1: [6, 11, 16],
        2: [7, 12, 17],
        3: [8, 13, 18],
        4: [9, 14, 19],
        5: [0, 7, 8],
        6: [1, 8, 9],
        7: [2, 5, 9],
        8: [3, 5, 6],
        9: [4, 6, 7],
        10: [0, 11, 19],
        11: [1, 10, 12],
        12: [2, 11, 13],
        13: [3, 12, 14],
        14: [4, 13, 15],
        15: [0, 14, 16],
        16: [1, 15, 17],
        17: [2, 16, 18],
        18: [3, 17, 19],
        19: [4, 10, 18],
      };
    }
    default:
      throw new Error(
        'Valid chain counts are 2, 3, 10, 20; if you need a different chain count, please provide the graph explicitly',
      );
  }
}
