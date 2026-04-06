import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRegisterDefaultClients = vi.fn();
const mockSetCommentMode = vi.fn();

vi.mock('./client-setup.js', () => ({
  registerDefaultClients: mockRegisterDefaultClients,
}));

vi.mock('./config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config.js')>();
  return {
    ...actual,
    setCommentMode: mockSetCommentMode,
    CONFIG_PATH: '/tmp/jira-dev-config.json',
  };
});

describe('cmdSetup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prints registration summary when setup succeeds', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    mockRegisterDefaultClients.mockResolvedValue({
      registered: ['Claude Code'],
      alreadyRegistered: ['OpenCode'],
      errors: [],
    });

    const { cmdSetup } = await import('./cli.js');
    await cmdSetup();

    expect(mockRegisterDefaultClients).toHaveBeenCalledWith('jira', { command: 'jira-dev', args: ['server'] });
    expect(logSpy).toHaveBeenCalledWith('✓ Registered in Claude Code');
    expect(logSpy).toHaveBeenCalledWith('✓ Already registered in OpenCode');
    expect(logSpy).toHaveBeenCalledWith('\nRestart your MCP client to load the server.');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits when setup reports config errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    mockRegisterDefaultClients.mockResolvedValue({
      registered: [],
      alreadyRegistered: [],
      errors: ['Claude Code: Config file is not valid JSON: /tmp/.claude.json'],
    });

    const { cmdSetup } = await import('./cli.js');
    await expect(cmdSetup()).rejects.toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalledWith('✗ Claude Code: Config file is not valid JSON: /tmp/.claude.json');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('cmdConfigSetCommentMode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('saves comment mode preference', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockSetCommentMode.mockResolvedValue({ commentMode: 'manual' });

    const { cmdConfigSetCommentMode } = await import('./cli.js');
    await cmdConfigSetCommentMode(['manual']);

    expect(mockSetCommentMode).toHaveBeenCalledWith('manual');
    expect(logSpy).toHaveBeenCalledWith('Comment mode set to manual');
    expect(logSpy).toHaveBeenCalledWith('Saved to /tmp/jira-dev-config.json');
  });
});
