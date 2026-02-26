import express from 'express';
import { authMiddleware, requireScope, type AuthenticatedRequest } from './auth';
import { audit } from './audit';
import { config } from './config';
import { executePlan } from './execute';
import { assertInternalTokenSecret, internalTokenMiddleware } from './internal-auth';
import { searchOperations, assertReducedSpecLoadable } from './openapi';
import { assertAllowedHost, validateExecuteRequest } from './policy';
import { assertSandboxPolicy } from './sandbox';
import { OPERATION_BY_ID } from './operations';
import { rateLimitMiddleware } from './rate-limit';
import type { ExecuteRequest } from './types';

assertReducedSpecLoadable();
assertAllowedHost(config.apiBaseUrl);
try {
  assertInternalTokenSecret(config.gatewaySecret);
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '128kb' }));
app.use(internalTokenMiddleware(config.gatewaySecret));

app.get('/mcp/search', authMiddleware, rateLimitMiddleware, (req: AuthenticatedRequest, res) => {
  const query = String(req.query.q || '');
  const results = searchOperations(query);

  audit('mcp.search', {
    actor: req.auth?.sub,
    query,
    resultCount: results.length,
  });

  res.json({ operations: results });
});

app.post(
  '/mcp/execute',
  authMiddleware,
  rateLimitMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!config.executeEnabled) {
        res
          .status(503)
          .json({ error: 'EXECUTE_DISABLED', message: 'Execute endpoint is disabled.' });
        return;
      }

      const input = req.body as ExecuteRequest;
      validateExecuteRequest(input);
      assertSandboxPolicy(input);

      const requiredScopes = new Set(
        input.steps.map((step) => {
          const operation = OPERATION_BY_ID.get(step.operationId);
          if (!operation) {
            throw new Error(`Operation not allowed: ${step.operationId}`);
          }
          return operation.scope;
        })
      );

      for (const scope of requiredScopes) {
        if (!requireScope(req, scope)) {
          res.status(403).json({ error: 'FORBIDDEN', message: `Missing required scope: ${scope}` });
          return;
        }
      }

      const token = (req.header('authorization') || '').split(' ')[1];
      const results = await executePlan(input, token, new Set(req.auth?.scopes || []));

      audit('mcp.execute', {
        actor: req.auth?.sub,
        steps: input.steps.map((step) => step.operationId),
        idempotencyKey: input.idempotencyKey,
        statuses: results.map((item) => item.status),
      });

      res.json({ results });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      audit('mcp.execute.error', {
        actor: req.auth?.sub,
        message,
      });

      res.status(400).json({ error: 'EXECUTION_FAILED', message });
    }
  }
);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`MCP gateway listening on http://localhost:${config.port}`);
});
