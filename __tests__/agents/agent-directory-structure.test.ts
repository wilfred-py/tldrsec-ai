/**
 * QA Test Suite: Agent Directory Structure Validation
 * Tests for PR #167 - Agent reorganization into ai-automation-specialists directory
 * 
 * Purpose: Ensure agent reorganization maintains functionality and discoverability
 */

import fs from 'fs';
import path from 'path';

describe('Agent Directory Structure Validation', () => {
  const agentsRootPath = path.join(process.cwd(), '.claude', 'agents');
  const aiAutomationSpecialistsPath = path.join(agentsRootPath, 'ai-automation-specialists');
  
  // Expected agents that were moved to ai-automation-specialists directory
  const expectedAgents = [
    'ai-workflow-designer.md',
    'automation-architect.md',
    'integration-specialist-aa.md',
    'ml-engineer-aa.md',
    'prompt-engineer-aa.md',
    'workflow-analyst-aa.md'
  ];
  
  // Regression test: Agents that should NOT exist in root anymore
  const movedAgentPaths = expectedAgents.map(agent => 
    path.join(agentsRootPath, agent)
  );

  describe('Directory Structure', () => {
    test('ai-automation-specialists directory should exist', () => {
      expect(fs.existsSync(aiAutomationSpecialistsPath)).toBe(true);
      expect(fs.statSync(aiAutomationSpecialistsPath).isDirectory()).toBe(true);
    });

    test('ai-automation-specialists directory should be readable', () => {
      expect(() => {
        fs.readdirSync(aiAutomationSpecialistsPath);
      }).not.toThrow();
    });
  });

  describe('Agent File Presence', () => {
    test('all expected agents should exist in ai-automation-specialists directory', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        expect(fs.existsSync(agentPath)).toBe(true);
        expect(fs.statSync(agentPath).isFile()).toBe(true);
      });
    });

    test('agents should NOT exist in root agents directory anymore', () => {
      movedAgentPaths.forEach(agentPath => {
        expect(fs.existsSync(agentPath)).toBe(false);
      });
    });
  });

  describe('Agent Content Integrity', () => {
    test('each agent file should have valid YAML frontmatter', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const content = fs.readFileSync(agentPath, 'utf8');
        
        // Should start with YAML frontmatter
        expect(content.startsWith('---')).toBe(true);
        
        // Should have closing YAML frontmatter
        const frontmatterEnd = content.indexOf('---', 3);
        expect(frontmatterEnd).toBeGreaterThan(3);
        
        // Should have content after frontmatter
        expect(content.length).toBeGreaterThan(frontmatterEnd + 4);
      });
    });

    test('each agent should have required metadata fields', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const content = fs.readFileSync(agentPath, 'utf8');
        
        // Extract frontmatter
        const frontmatterEnd = content.indexOf('---', 3);
        const frontmatter = content.substring(3, frontmatterEnd);
        
        // Should have name field
        expect(frontmatter).toMatch(/name:\s*.+/);
        
        // Should have description field
        expect(frontmatter).toMatch(/description:\s*.+/);
      });
    });

    test('agent files should be readable and non-empty', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const content = fs.readFileSync(agentPath, 'utf8');
        
        expect(content.length).toBeGreaterThan(100); // Reasonable minimum content
        expect(content.trim()).not.toBe('');
      });
    });
  });

  describe('Regression Tests', () => {
    test('regression-tester agent should be removed', () => {
      const regressionTesterPath = path.join(agentsRootPath, 'regression-tester.md');
      expect(fs.existsSync(regressionTesterPath)).toBe(false);
    });

    test('other agent directories should remain intact', () => {
      const expectedDirectories = [
        'account-team-agents',
        'core',
        'design',
        'finance-strategy',
        'growth-revenue-operations',
        'market-research-agents',
        'marketing',
        'operations',
        'product',
        'project-management',
        'specialized-agents',
        'testing'
      ];

      expectedDirectories.forEach(dirName => {
        const dirPath = path.join(agentsRootPath, dirName);
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      });
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle case-sensitive file system access', () => {
      // Test both lowercase and original case variations
      const testCases = [
        'ai-automation-specialists',
        'AI-AUTOMATION-SPECIALISTS', // Should fail on case-sensitive systems
      ];

      const correctPath = path.join(agentsRootPath, testCases[0]);
      expect(fs.existsSync(correctPath)).toBe(true);

      // On case-sensitive systems (Linux), this should fail
      // On case-insensitive systems (macOS, Windows), this will succeed
      const wrongCasePath = path.join(agentsRootPath, testCases[1]);
      const isCaseSensitive = process.platform === 'linux';
      
      if (isCaseSensitive) {
        expect(fs.existsSync(wrongCasePath)).toBe(false);
      } else {
        // On case-insensitive systems, both paths work
        expect(fs.existsSync(wrongCasePath)).toBe(true);
      }
    });

    test('should handle concurrent access to agent directory', async () => {
      // Simulate concurrent reads
      const promises = expectedAgents.map(async (agentFile) => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        return fs.promises.readFile(agentPath, 'utf8');
      });

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    test('should validate file permissions', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const stats = fs.statSync(agentPath);
        
        // File should be readable
        expect(stats.mode & parseInt('400', 8)).not.toBe(0);
      });
    });
  });

  describe('Performance Impact', () => {
    test('directory listing should complete within reasonable time', () => {
      const startTime = process.hrtime.bigint();
      fs.readdirSync(aiAutomationSpecialistsPath);
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100); // Should complete within 100ms
    });

    test('agent file reading should be efficient', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        
        const startTime = process.hrtime.bigint();
        fs.readFileSync(agentPath, 'utf8');
        const endTime = process.hrtime.bigint();
        
        const durationMs = Number(endTime - startTime) / 1000000;
        expect(durationMs).toBeLessThan(50); // Should read within 50ms
      });
    });
  });
});

/**
 * Integration Test: Agent Discovery Simulation
 * Tests how the system would discover and load agents from new directory structure
 */
describe('Agent Discovery Integration', () => {
  const agentsRootPath = path.join(process.cwd(), '.claude', 'agents');
  
  test('should discover all agents recursively', () => {
    const discoverAgents = (dir: string): string[] => {
      const agents: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          agents.push(...discoverAgents(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          agents.push(fullPath);
        }
      }
      
      return agents;
    };

    const allAgents = discoverAgents(agentsRootPath);
    
    // Should find agents in ai-automation-specialists directory
    const automationAgents = allAgents.filter(agent => 
      agent.includes('ai-automation-specialists')
    );
    
    expect(automationAgents.length).toBe(6);
    
    // Verify specific agents are found
    expect(automationAgents.some(agent => agent.includes('ai-workflow-designer.md'))).toBe(true);
    expect(automationAgents.some(agent => agent.includes('automation-architect.md'))).toBe(true);
    expect(automationAgents.some(agent => agent.includes('integration-specialist-aa.md'))).toBe(true);
    expect(automationAgents.some(agent => agent.includes('ml-engineer-aa.md'))).toBe(true);
    expect(automationAgents.some(agent => agent.includes('prompt-engineer-aa.md'))).toBe(true);
    expect(automationAgents.some(agent => agent.includes('workflow-analyst-aa.md'))).toBe(true);
  });
});