import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand,
  type ListKeysCommandInput,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import type { DeleteItem, ManagedState, PutItem } from "../types.js";
import { AwsOperationError } from "../errors.js";

export interface IKvsService {
  listAllKeys(kvsArn: string): Promise<ManagedState>;
  applyDiff(kvsArn: string, puts: PutItem[], deletes: DeleteItem[]): Promise<void>;
}

export class KvsService implements IKvsService {
  private readonly client: CloudFrontKeyValueStoreClient;
  private readonly maxRetries: number;
  private static readonly MAX_UPDATE_ITEMS_PER_REQUEST = 50;

  constructor(maxRetries = 3) {
    this.client = new CloudFrontKeyValueStoreClient({ region: 'us-east-1' });
    this.maxRetries = maxRetries;
  }

  async listAllKeys(kvsArn: string): Promise<ManagedState> {
    const map: ManagedState = new Map();
    let nextToken: string | undefined;

    do {
      const input: ListKeysCommandInput = { KvsARN: kvsArn, NextToken: nextToken };
      const result = await this.client.send(new ListKeysCommand(input));
      for (const item of result.Items ?? []) {
        if (item.Key && typeof item.Value === "string") {
          map.set(item.Key, item.Value);
        }
      }
      nextToken = result.NextToken;
    } while (nextToken);

    return map;
  }

  async applyDiff(kvsArn: string, puts: PutItem[], deletes: DeleteItem[]): Promise<void> {
    if (puts.length === 0 && deletes.length === 0) return;

    const batches = this.createUpdateBatches(puts, deletes);
    for (const batch of batches) {
      await this.applySingleBatch(kvsArn, batch.puts, batch.deletes);
    }
  }

  private createUpdateBatches(
    puts: PutItem[],
    deletes: DeleteItem[],
  ): Array<{ puts: PutItem[]; deletes: DeleteItem[] }> {
    const batches: Array<{ puts: PutItem[]; deletes: DeleteItem[] }> = [];
    let putIndex = 0;
    let deleteIndex = 0;

    while (putIndex < puts.length || deleteIndex < deletes.length) {
      const batchPuts: PutItem[] = [];
      const batchDeletes: DeleteItem[] = [];
      let remaining = KvsService.MAX_UPDATE_ITEMS_PER_REQUEST;

      while (remaining > 0 && putIndex < puts.length) {
        batchPuts.push(puts[putIndex]);
        putIndex += 1;
        remaining -= 1;
      }

      while (remaining > 0 && deleteIndex < deletes.length) {
        batchDeletes.push(deletes[deleteIndex]);
        deleteIndex += 1;
        remaining -= 1;
      }

      batches.push({ puts: batchPuts, deletes: batchDeletes });
    }

    return batches;
  }

  private async applySingleBatch(kvsArn: string, puts: PutItem[], deletes: DeleteItem[]): Promise<void> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const described = await this.client.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
        const ifMatch = described.ETag;
        if (!ifMatch) {
          throw new AwsOperationError("DescribeKeyValueStore did not return ETag.");
        }

        await this.client.send(
          new UpdateKeysCommand({
            KvsARN: kvsArn,
            IfMatch: ifMatch,
            Puts: puts.map((item) => ({ Key: item.key, Value: item.value })),
            Deletes: deletes.map((item) => ({ Key: item.key })),
          }),
        );

        return;
      } catch (error) {
        const finalAttempt = attempt === this.maxRetries;
        if (finalAttempt) {
          throw new AwsOperationError(
            `KVS update failed after ${this.maxRetries} retries due to concurrent modification`,
            error,
          );
        }
      }
    }
  }
}
