export class JiraError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JiraError';
  }
}

export class JiraAuthError extends JiraError {
  constructor(message: string) {
    super(message);
    this.name = 'JiraAuthError';
  }
}

export class JiraApiError extends JiraError {
  readonly status: number;
  readonly responseBody: string;

  constructor(status: number, body: string, label?: string) {
    super(`${label ?? 'Jira API'} error ${status}: ${body}`);
    this.name = 'JiraApiError';
    this.status = status;
    this.responseBody = body;
  }
}

export class JiraValidationError extends JiraError {
  constructor(message: string) {
    super(message);
    this.name = 'JiraValidationError';
  }
}

export class JiraNetworkError extends JiraError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'JiraNetworkError';
  }
}
