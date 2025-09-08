# MCP Server API Tokens Setup Guide

This guide will help you obtain all the necessary API tokens for the MCP servers we've installed.

## 1. Railway API Token

**Steps:**
1. Go to https://railway.app and log in to your account
2. Navigate to Account Settings → Tokens (or direct link: https://railway.app/account/tokens)
3. Click "Create New Token"
4. Give it a name like "MCP Server Access"
5. Copy the generated token

**Token will be used for:** Project management, deployments, service monitoring

---

## 2. GitHub Personal Access Token

**Steps:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a note like "MCP Server Access"
4. Select these scopes:
   - `repo` (Full control of private repositories)
   - `read:org` (Read org and team membership)
   - `read:user` (Read user profile data)
   - `user:email` (Access user email addresses)
5. Click "Generate token"
6. Copy the generated token immediately (you won't see it again)

**Token will be used for:** Repository management, issues, pull requests, workflows

---

## 3. Dart API Key

**Steps:**
1. Go to https://help.dartai.com/en/articles/7997029-manage-api-keys
2. Sign in to your Dart account
3. Navigate to Settings → API Keys
4. Click "Create New API Key"
5. Give it a name like "MCP Server Access"
6. Copy the generated API key

**Token will be used for:** Task management, project planning, team collaboration

---

## 4. Playwright API Key

**Note:** Playwright MCP may not require an API key for basic local testing. Check the repository documentation.

**If needed:**
1. Go to https://playwright.dev/
2. Check if you need Microsoft Playwright Testing service access
3. If so, sign up for Azure account and enable Playwright Testing
4. Generate service credentials from Azure portal

**Token will be used for:** Test automation, browser testing

---

## 5. Neon API Key

**Steps:**
1. Go to https://console.neon.tech/
2. Log in to your Neon account
3. Navigate to Account Settings → Developer Settings → API Keys
4. Click "Create API Key"
5. Give it a name like "MCP Server Access"
6. Copy the generated API key

**Token will be used for:** Database management, query execution, connection pooling

---

## Next Steps

Once you have all the tokens, I'll update the global MCP configuration file at:
`/Users/wilf/Library/Application Support/Windsurf/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

## Security Note

- Keep all API tokens secure and never commit them to version control
- Consider using environment variables or secure storage
- Regularly rotate tokens for security
