# sync-cfkvs-action

GitHub Action to synchronize an Amazon CloudFront KeyValueStore from a repository JSONC file.

## Inputs

- `kvs-arn` (required)
- `file` (required)
- `dry-run` (`false` by default)
- `delete-missing` (`true` by default)
- `fail-on-empty` (`true` by default)
- `max-preview-items` (`50` by default)
- `log-level` (`info` by default; `info` or `debug`)
- `aws-region` (`us-east-1` by default)
- `prefix` (empty by default)

## Build

```bash
npm install
npm run build
```

## Test

```bash
npm test
```

## Example workflow

```yaml
- uses: your-org/sync-cloudfront-kvs-action@v1
  with:
    kvs-arn: ${{ secrets.CLOUDFRONT_KVS_ARN }}
    file: cloudfront/kvs/allowlist.jsonc
    dry-run: "false"
    delete-missing: "true"
```
