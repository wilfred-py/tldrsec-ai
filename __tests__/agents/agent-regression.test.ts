/**
 * QA Regression Test Suite: Agent Reorganization Impact Analysis
 * Tests for PR #167 - Validates no regression in agent functionality
 * 
 * Purpose: Ensure that the file reorganization doesn't break existing functionality
 */

import fs from 'fs';
import path from 'path';

describe('Agent Reorganization Regression Tests', () => {
  const agentsRootPath = path.join(process.cwd(), '.claude', 'agents');
  const aiAutomationSpecialistsPath = path.join(agentsRootPath, 'ai-automation-specialists');
  
  describe('Backward Compatibility Tests', () => {
    test('should not break if system tries to access old agent paths', () => {
      const oldPaths = [
        'ai-workflow-designer.md',
        'automation-architect.md',
        'integration-specialist-aa.md',
        'ml-engineer-aa.md',
        'prompt-engineer-aa.md',
        'workflow-analyst-aa.md'
      ];

      oldPaths.forEach(agentFile => {
        const oldPath = path.join(agentsRootPath, agentFile);
        const newPath = path.join(aiAutomationSpecialistsPath, agentFile);
        
        // Old path should not exist
        expect(fs.existsSync(oldPath)).toBe(false);
        // New path should exist
        expect(fs.existsSync(newPath)).toBe(true);
      });
    });

    test('should handle graceful degradation for missing regression-tester agent', () => {
      const regressionTesterPath = path.join(agentsRootPath, 'regression-tester.md');
      
      expect(fs.existsSync(regressionTesterPath)).toBe(false);
      
      // System should handle missing file gracefully
      expect(() => {
        try {
          fs.readFileSync(regressionTesterPath, 'utf8');
        } catch (error) {
          if (error instanceof Error && 'code' in error) {
            expect(error.code).toBe('ENOENT');
          }
          throw error;
        }
      }).toThrow();
    });
  });

  describe('Agent Content Validation', () => {
    const expectedAgents = [
      'ai-workflow-designer.md',
      'automation-architect.md',
      'integration-specialist-aa.md',
      'ml-engineer-aa.md',
      'prompt-engineer-aa.md',
      'workflow-analyst-aa.md'
    ];

    test('each agent should maintain valid frontmatter structure', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const content = fs.readFileSync(agentPath, 'utf8');
        
        // Should start and end with proper YAML delimiters
        expect(content.startsWith('---')).toBe(true);
        
        const frontmatterEndIndex = content.indexOf('---', 3);
        expect(frontmatterEndIndex).toBeGreaterThan(3);
        
        // Extract and validate frontmatter
        const frontmatter = content.substring(3, frontmatterEndIndex);
        
        // Should contain essential fields
        expect(frontmatter).toMatch(/name:\s*.+/);
        expect(frontmatter).toMatch(/description:\s*.+/);
        
        // Description should contain examples
        expect(frontmatter).toMatch(/example.*Context/i);
      });
    });

    test('agents should maintain expected naming conventions', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const content = fs.readFileSync(agentPath, 'utf8');
        
        // Extract name from frontmatter
        const nameMatch = content.match(/name:\s*(.+)/);
        expect(nameMatch).toBeTruthy();
        
        if (nameMatch) {
          const agentName = nameMatch[1].trim();
          const expectedName = path.basename(agentFile, '.md');
          expect(agentName).toBe(expectedName);
        }
      });
    });

    test('agents should have consistent metadata format', () => {
      expectedAgents.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const content = fs.readFileSync(agentPath, 'utf8');
        
        // Check for consistent structure
        const lines = content.split('\n');
        expect(lines[0]).toBe('---');
        
        // Find the end of frontmatter
        const frontmatterEndLine = lines.findIndex((line, index) => 
          index > 0 && line === '---'
        );
        expect(frontmatterEndLine).toBeGreaterThan(0);
        
        // Should have content after frontmatter
        expect(lines.length).toBeGreaterThan(frontmatterEndLine + 1);
        expect(lines[frontmatterEndLine + 1]).toBeDefined();
      });
    });
  });

  describe('Directory Structure Integrity', () => {
    test('should maintain proper directory hierarchy', () => {
      const stats = fs.statSync(aiAutomationSpecialistsPath);
      expect(stats.isDirectory()).toBe(true);
      
      // Check parent directory
      const parentStats = fs.statSync(agentsRootPath);
      expect(parentStats.isDirectory()).toBe(true);
      
      // Verify it's properly nested
      expect(aiAutomationSpecialistsPath.startsWith(agentsRootPath)).toBe(true);
    });

    test('should not create orphaned or duplicate files', () => {
      const agentsInSubdir = fs.readdirSync(aiAutomationSpecialistsPath);
      const agentsInRoot = fs.readdirSync(agentsRootPath)
        .filter(item => item.endsWith('.md'));
      
      // Check for duplicates
      const duplicates = agentsInSubdir.filter(agent => 
        agentsInRoot.includes(agent)
      );
      expect(duplicates).toHaveLength(0);
    });

    test('should maintain proper file permissions', () => {
      const agentFiles = fs.readdirSync(aiAutomationSpecialistsPath);
      
      agentFiles.forEach(agentFile => {
        const agentPath = path.join(aiAutomationSpecialistsPath, agentFile);
        const stats = fs.statSync(agentPath);
        
        // File should be readable
        expect(stats.mode & parseInt('400', 8)).not.toBe(0);
        
        // File should be a regular file
        expect(stats.isFile()).toBe(true);
        
        // File should have reasonable size (not empty, not suspiciously large)
        expect(stats.size).toBeGreaterThan(100);
        expect(stats.size).toBeLessThan(50000); // 50KB should be plenty for an agent file
      });
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should handle invalid path access gracefully', () => {
      const invalidPaths = [
        path.join(aiAutomationSpecialistsPath, 'non-existent-agent.md'),
        path.join(aiAutomationSpecialistsPath, '..', 'regression-tester.md'),
        path.join(agentsRootPath, 'ai-automation-specialists', 'invalid.txt')
      ];

      invalidPaths.forEach(invalidPath => {
        expect(fs.existsSync(invalidPath)).toBe(false);
        
        expect(() => {
          try {
            fs.readFileSync(invalidPath, 'utf8');
          } catch (error) {
            if (error instanceof Error && 'code' in error) {
              expect(['ENOENT', 'EISDIR', 'EPERM']).toContain(error.code);
            }
            throw error;
          }
        }).toThrow();
      });
    });

    test('should handle directory traversal attacks', () => {
      const maliciousPaths = [
        path.join(aiAutomationSpecialistsPath, '../../../etc/passwd'),
        path.join(aiAutomationSpecialistsPath, '..\\..\\windows\\system32'),
        path.join(aiAutomationSpecialistsPath, '%2e%2e%2f%2e%2e%2fpasswd')
      ];

      maliciousPaths.forEach(maliciousPath => {
        // Path should not exist or should not be within our expected directory
        const resolvedPath = path.resolve(maliciousPath);
        const expectedBasePath = path.resolve(aiAutomationSpecialistsPath);
        
        // If path exists, it should still be within our safe directory
        if (fs.existsSync(resolvedPath)) {
          expect(resolvedPath.startsWith(expectedBasePath)).toBe(true);
        }
      });
    });
  });

  describe('Performance Regression Tests', () => {
    test('directory listing should not degrade performance', () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        fs.readdirSync(aiAutomationSpecialistsPath);
        const endTime = process.hrtime.bigint();
        
        const durationMs = Number(endTime - startTime) / 1000000;
        times.push(durationMs);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(10); // Average should be under 10ms
      expect(maxTime).toBeLessThan(50); // Maximum should be under 50ms
    });

    test('recursive directory traversal should be efficient', () => {
      const startTime = process.hrtime.bigint();
      
      const countFilesRecursively = (dir: string): number => {
        let count = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            count += countFilesRecursively(path.join(dir, entry.name));
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            count++;
          }
        }
        
        return count;
      };

      const totalAgents = countFilesRecursively(agentsRootPath);
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000;
      
      expect(totalAgents).toBeGreaterThan(6); // Should find at least our 6 moved agents
      expect(durationMs).toBeLessThan(100); // Should complete within 100ms
    });
  });
});