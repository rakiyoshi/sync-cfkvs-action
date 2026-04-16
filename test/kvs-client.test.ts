import { describe, expect, it, vi } from "vitest";
import {
  DescribeKeyValueStoreCommand,
  UpdateKeysCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import { KvsService } from "../src/aws/kvs-client";

describe("KvsService.applyDiff", () => {
  it("splits updates so each UpdateKeys request has at most 50 items", async () => {
    const service = new KvsService(1);
    const updates: Array<{ puts: number; deletes: number }> = [];

    const send = vi.fn(async (command: unknown) => {
      if (command instanceof DescribeKeyValueStoreCommand) {
        return { ETag: "etag" };
      }

      if (command instanceof UpdateKeysCommand) {
        const input = command.input;
        updates.push({
          puts: input.Puts?.length ?? 0,
          deletes: input.Deletes?.length ?? 0,
        });
        return {};
      }

      throw new Error("Unexpected command");
    });

    (service as unknown as { client: { send: typeof send } }).client = { send };

    const puts = Array.from({ length: 60 }, (_, i) => ({ key: `put-${i}`, value: `${i}` }));
    const deletes = Array.from({ length: 10 }, (_, i) => ({ key: `delete-${i}` }));

    await service.applyDiff("arn:aws:cloudfront::123:key-value-store/test", puts, deletes);

    expect(updates).toEqual([
      { puts: 50, deletes: 0 },
      { puts: 10, deletes: 10 },
    ]);
    for (const batch of updates) {
      expect(batch.puts + batch.deletes).toBeLessThanOrEqual(50);
    }

    expect(send).toHaveBeenCalledTimes(4);
  });

  it("splits delete-only updates to respect the same 50 item limit", async () => {
    const service = new KvsService(1);
    const updates: number[] = [];

    const send = vi.fn(async (command: unknown) => {
      if (command instanceof DescribeKeyValueStoreCommand) {
        return { ETag: "etag" };
      }

      if (command instanceof UpdateKeysCommand) {
        updates.push(command.input.Deletes?.length ?? 0);
        return {};
      }

      throw new Error("Unexpected command");
    });

    (service as unknown as { client: { send: typeof send } }).client = { send };

    const deletes = Array.from({ length: 51 }, (_, i) => ({ key: `delete-${i}` }));
    await service.applyDiff("arn:aws:cloudfront::123:key-value-store/test", [], deletes);

    expect(updates).toEqual([50, 1]);
  });
});
