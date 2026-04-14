# sync-cfkvs-action

GitHub Action to synchronize an Amazon CloudFront KeyValueStore from a repository JSONC file.

## Runtime requirements

- GitHub hosted runner (or self-hosted runner) with AWS CLI v2 available in PATH
- Credentials configured (for example via `aws-actions/configure-aws-credentials`)

## Inputs

See [action.yml](action.yml).

```yaml
- uses: rakiyoshi/sync-cloudfront-kvs-action@v1
  with:
    # ARN of the target Amazon CloudFront KeyValueStore
    kvs-arn: ""

    # Path to the JSONC source file
    file: ""

    # If true, do not apply changes to the target CloudFront KeyValueStore
    # Default: false
    dry-run: "false"

    # If true, delete keys from the target CloudFront KeyValueStore that are not present in the source file
    # Default: true
    delete-missing: "true"

    # If true, fail the job if the source file is empty
    # Default: true
    fail-on-empty: "true"

    # Maximum number of items to preview in the logs
    # Default: 50
    max-preview-items: "50"

    # Level of logging to use (info or debug)
    # Default: info
    log-level: "info"

    # Optional prefix to filter the keys to manage
    # Default: ''
    prefix: ""
```

## Example workflow

```yaml
- uses: rakiyoshi/sync-cloudfront-kvs-action@v1
  with:
    kvs-arn: ${{ env.CLOUDFRONT_KVS_ARN }}
    file: cloudfront/kvs/allowlist.jsonc
    dry-run: "false"
    delete-missing: "true"
```
