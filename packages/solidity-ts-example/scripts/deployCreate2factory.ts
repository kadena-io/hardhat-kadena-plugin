import { chainweb } from 'hardhat';

async function main() {
  await chainweb.switchChain(0);

  const result = await chainweb.create2Helpers.deployCreate2Factory();

  console.log(
    'deployCreate2Factory',
    result.map((r) => ({ chain: r.chain, address: r.address })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
