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

export function createGraph(chains: number = 2): Array<number[]> {
  switch (chains) {
    case 2:
      return [[1], [0]];
    case 3:
      return [
        [1, 2],
        [0, 2],
        [0, 1],
      ];
    case 10:
      return [
        [3, 2, 5],
        [4, 3, 6],
        [0, 4, 7],
        [1, 0, 8],
        [2, 1, 9],
        [9, 6, 0],
        [5, 7, 1],
        [6, 8, 2],
        [7, 9, 3],
        [8, 5, 4],
      ];
    case 20: {
      return [
        [5, 10, 15],
        [6, 11, 16],
        [7, 12, 17],
        [8, 13, 18],
        [9, 14, 19],
        [0, 7, 8],
        [1, 8, 9],
        [2, 5, 9],
        [3, 5, 6],
        [4, 6, 7],
        [0, 11, 19],
        [1, 10, 12],
        [2, 11, 13],
        [3, 12, 14],
        [4, 13, 15],
        [0, 14, 16],
        [1, 15, 17],
        [2, 16, 18],
        [3, 17, 19],
        [4, 10, 18],
      ];
    }
    default:
      throw new Error(
        'Valid chain counts are 2, 3, 10, 20; if you need a different chain count, please provide the graph explicitly',
      );
  }
}
