export type ErrorCode = "ConfigError" | "GitError" | "InstallError" | "RuntimeError";

export class AppsCliError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, opts: { hint?: string } = {}) {
    super(message);
    this.name = code;
    this.code = code;
    this.hint = opts.hint;
  }
}

export class ConfigError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("ConfigError", message, opts);
  }
}

export class GitError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("GitError", message, opts);
  }
}

export class InstallError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("InstallError", message, opts);
  }
}

export class RuntimeError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("RuntimeError", message, opts);
  }
}
