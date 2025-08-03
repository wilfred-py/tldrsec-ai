import { default as Sequencer } from '@jest/test-sequencer';

class BuildTestSequencer extends Sequencer {
  sort(tests) {
    // Define the order of test execution
    const testOrder = [
      'pre-build.test.ts',   // Run pre-build validations first
      'post-build.test.ts',  // Then validate build artifacts
      'integration.test.ts'  // Finally run integration tests
    ];

    return tests.sort((testA, testB) => {
      const aName = testA.path.split('/').pop();
      const bName = testB.path.split('/').pop();
      
      const aIndex = testOrder.findIndex(order => aName.includes(order));
      const bIndex = testOrder.findIndex(order => bName.includes(order));
      
      // If both tests are in the order list, sort by index
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      
      // If only one test is in the order list, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      // For tests not in the order list, maintain alphabetical order
      return aName.localeCompare(bName);
    });
  }
}

export default BuildTestSequencer;