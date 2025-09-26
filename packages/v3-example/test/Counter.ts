import { expect } from 'chai';
import hre from 'hardhat';

const { ethers } = await hre.chainweb.connect({
  cwId: 0,
});

describe('Counter', function () {
  it('should get chain ids', async function () {
    console.log('Chain IDs:', hre.chainweb.getCwChainIds());
  });
  it('Should emit the Increment event when calling the inc() function', async function () {
    const counter = await ethers.deployContract('Counter');
    await expect(counter.inc()).to.emit(counter, 'Increment').withArgs(1n);
  });

  it('The sum of the Increment events should match the current value', async function () {
    const counter = await ethers.deployContract('Counter');
    const deploymentBlockNumber = await ethers.provider.getBlockNumber();

    // run a series of increments
    for (let i = 1; i <= 10; i++) {
      await counter.incBy(i);
    }

    const events = await counter.queryFilter(
      counter.filters.Increment(),
      deploymentBlockNumber,
      'latest',
    );

    // check that the aggregated events match the current value
    let total = 0n;
    for (const event of events) {
      total += event.args.by;
    }

    expect(await counter.x()).to.equal(total);
  });
});
