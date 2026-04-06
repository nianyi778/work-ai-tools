import { describe, expect, it } from 'vitest';
import { JiraApiError, JiraAuthError, JiraError, JiraNetworkError, JiraValidationError } from './errors.js';

describe('errors hierarchy', () => {
  it('all custom errors extend JiraError', () => {
    expect(new JiraAuthError('auth')).toBeInstanceOf(JiraError);
    expect(new JiraApiError(500, 'boom')).toBeInstanceOf(JiraError);
    expect(new JiraValidationError('invalid')).toBeInstanceOf(JiraError);
    expect(new JiraNetworkError('network')).toBeInstanceOf(JiraError);
  });

  it('JiraApiError exposes status and responseBody', () => {
    const error = new JiraApiError(404, 'not found', 'Jira API');
    expect(error.status).toBe(404);
    expect(error.responseBody).toBe('not found');
    expect(error.message).toContain('Jira API error 404: not found');
  });

  it('JiraNetworkError preserves cause', () => {
    const cause = new Error('socket closed');
    const error = new JiraNetworkError('network failure', cause);

    expect(error.cause).toBe(cause);
  });

  it('sets error names correctly', () => {
    expect(new JiraError('base').name).toBe('JiraError');
    expect(new JiraAuthError('auth').name).toBe('JiraAuthError');
    expect(new JiraApiError(400, 'bad').name).toBe('JiraApiError');
    expect(new JiraValidationError('invalid').name).toBe('JiraValidationError');
    expect(new JiraNetworkError('network').name).toBe('JiraNetworkError');
  });

  it('instanceof hierarchy checks behave as expected', () => {
    const apiError = new JiraApiError(503, 'busy');

    expect(apiError instanceof JiraApiError).toBe(true);
    expect(apiError instanceof JiraError).toBe(true);
    expect(apiError instanceof Error).toBe(true);
    expect(apiError instanceof JiraAuthError).toBe(false);
  });
});
