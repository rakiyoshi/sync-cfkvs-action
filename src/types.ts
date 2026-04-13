export type DesiredState = Map<string, string>;

export type ManagedState = Map<string, string>;

export type PutItem = { key: string; value: string };
export type DeleteItem = { key: string };

export type DiffResult = {
  puts: PutItem[];
  deletes: DeleteItem[];
  unchangedCount: number;
};

export type LogLevel = "info" | "debug";

export type ActionInputs = {
  kvsArn: string;
  file: string;
  dryRun: boolean;
  deleteMissing: boolean;
  failOnEmpty: boolean;
  maxPreviewItems: number;
  logLevel: LogLevel;
  awsRegion: string;
  prefix: string;
};
