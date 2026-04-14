export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class ParseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseValidationError";
  }
}

export class AwsOperationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AwsOperationError";
  }
}
