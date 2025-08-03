import { describe, test, expect, beforeAll } from '@jest/test';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Pre-Build Validation', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  
  describe('Environment Configuration', () => {
    test('should have required environment variables defined', () => {
      const requiredEnvVars = [
        'DATABASE_URL',
        'CLERK_SECRET_KEY',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'ANTHROPIC_API_KEY'
      ];

      for (const envVar of requiredEnvVars) {
        expect(process.env[envVar]).toBeDefined();
        expect(process.env[envVar]).not.toBe('');
      }
    });

    test('should have valid database URL format', () => {
      const dbUrl = process.env.DATABASE_URL;
      expect(dbUrl).toMatch(/^postgresql:\/\/.+/);
    });

    test('should have optional environment variables configured', () => {
      const optionalEnvVars = ['RESEND_API_KEY', 'SEC_USER_AGENT'];
      
      optionalEnvVars.forEach(envVar => {
        if (process.env[envVar]) {
          expect(process.env[envVar]).not.toBe('');
        }
      });
    });
  });

  describe('File Structure Validation', () => {
    test('should have essential configuration files', () => {
      const essentialFiles = [
        'package.json',
        'next.config.js',
        'tsconfig.json',
        'tailwind.config.js',
        'prisma/schema.prisma',
        '.env.local'
      ];

      essentialFiles.forEach(file => {
        const filePath = path.join(projectRoot, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });

    test('should have required directories', () => {
      const requiredDirs = [
        'app',
        'components',
        'lib',
        'services',
        'prisma',
        'public'
      ];

      requiredDirs.forEach(dir => {
        const dirPath = path.join(projectRoot, dir);
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      });
    });

    test('should have Next.js app directory structure', () => {
      const appDirs = [
        'app/(auth)',
        'app/(marketing)',
        'app/api',
        'app/dashboard'
      ];

      appDirs.forEach(dir => {
        const dirPath = path.join(projectRoot, dir);
        expect(fs.existsSync(dirPath)).toBe(true);
      });
    });
  });

  describe('Package Dependencies', () => {
    let packageJson: any;

    beforeAll(() => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    });

    test('should have required production dependencies', () => {
      const requiredDeps = [
        'next',
        'react',
        'react-dom',
        '@clerk/nextjs',
        '@prisma/client',
        'tailwindcss',
        '@anthropic-ai/sdk'
      ];

      requiredDeps.forEach(dep => {
        expect(packageJson.dependencies[dep]).toBeDefined();
      });
    });

    test('should have required development dependencies', () => {
      const requiredDevDeps = [
        'typescript',
        '@types/node',
        '@types/react',
        '@types/react-dom',
        'prisma',
        'eslint',
        'jest'
      ];

      requiredDevDeps.forEach(dep => {
        expect(packageJson.devDependencies[dep]).toBeDefined();
      });
    });

    test('should have required npm scripts', () => {
      const requiredScripts = [
        'dev',
        'build',
        'start',
        'lint',
        'test',
        'db:generate',
        'db:migrate',
        'db:push'
      ];

      requiredScripts.forEach(script => {
        expect(packageJson.scripts[script]).toBeDefined();
      });
    });
  });

  describe('Database Configuration', () => {
    test('should have valid Prisma schema', async () => {
      try {
        await execAsync('npx prisma validate', { cwd: projectRoot });
      } catch (error) {
        throw new Error(`Prisma schema validation failed: ${error}`);
      }
    });

    test('should have Prisma client generation configured', () => {
      const schemaPath = path.join(projectRoot, 'prisma/schema.prisma');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      
      expect(schema).toContain('generator client');
      expect(schema).toContain('provider = "prisma-client-js"');
    });
  });

  describe('TypeScript Configuration', () => {
    test('should have valid TypeScript configuration', () => {
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      
      expect(tsconfig.compilerOptions).toBeDefined();
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
    });

    test('should have path aliases configured', () => {
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      
      expect(tsconfig.compilerOptions.paths).toBeDefined();
      expect(tsconfig.compilerOptions.paths['@/*']).toBeDefined();
    });
  });

  describe('Next.js Configuration', () => {
    test('should have valid Next.js configuration', () => {
      const nextConfigPath = path.join(projectRoot, 'next.config.js');
      expect(fs.existsSync(nextConfigPath)).toBe(true);
    });

    test('should have proper webpack configuration for server/client modules', () => {
      const nextConfigPath = path.join(projectRoot, 'next.config.js');
      const config = fs.readFileSync(nextConfigPath, 'utf-8');
      
      expect(config).toContain('webpack');
      expect(config).toContain('fallback');
    });
  });

  describe('Component Dependencies', () => {
    test('should have UI components directory', () => {
      const uiComponentsPath = path.join(projectRoot, 'components/ui');
      expect(fs.existsSync(uiComponentsPath)).toBe(true);
    });

    test('should have essential page components', () => {
      const essentialPages = [
        'app/(marketing)/page.tsx',
        'app/dashboard/page.tsx',
        'app/(auth)/sign-in/[[...sign-in]]/page.tsx'
      ];

      essentialPages.forEach(page => {
        const pagePath = path.join(projectRoot, page);
        expect(fs.existsSync(pagePath)).toBe(true);
      });
    });
  });

  describe('API Route Validation', () => {
    test('should have critical API routes', () => {
      const criticalRoutes = [
        'app/api/health/route.ts',
        'app/api/filings/summary/route.ts',
        'app/api/user/tickers/route.ts'
      ];

      criticalRoutes.forEach(route => {
        const routePath = path.join(projectRoot, route);
        expect(fs.existsSync(routePath)).toBe(true);
      });
    });

    test('should have webhook endpoints', () => {
      const webhookPath = path.join(projectRoot, 'app/api/webhook/clerk/route.ts');
      expect(fs.existsSync(webhookPath)).toBe(true);
    });
  });

  describe('Security Configuration', () => {
    test('should not have sensitive files in repository', () => {
      const sensitiveFiles = [
        '.env',
        '.env.production',
        'private.key',
        'secrets.json'
      ];

      sensitiveFiles.forEach(file => {
        const filePath = path.join(projectRoot, file);
        expect(fs.existsSync(filePath)).toBe(false);
      });
    });

    test('should have proper gitignore configuration', () => {
      const gitignorePath = path.join(projectRoot, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('node_modules');
      expect(gitignore).toContain('.next');
    });
  });

  describe('Build Dependencies Check', () => {
    test('should be able to generate Prisma client', async () => {
      try {
        await execAsync('npm run db:generate', { cwd: projectRoot });
      } catch (error) {
        throw new Error(`Prisma client generation failed: ${error}`);
      }
    }, 30000);

    test('should pass linting without errors', async () => {
      try {
        await execAsync('npm run lint', { cwd: projectRoot });
      } catch (error) {
        // Allow warnings but not errors
        if (error.toString().includes('Error')) {
          throw new Error(`Linting failed with errors: ${error}`);
        }
      }
    }, 30000);
  });
});