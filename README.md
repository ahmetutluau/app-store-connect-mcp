# App Store Connect MCP

An MCP server for App Store Connect that works with Claude Desktop and Claude Code.

It focuses on two practical workflows:

- Read App Store Connect app and version data
- Read App Analytics report pipelines and safely prepare metadata updates

## Features

### App tools

- `list_apps`
- `get_app`
- `list_app_infos`
- `get_app_info_localizations`
- `get_app_store_versions`
- `get_app_store_version_localizations`

### Analytics tools

- `list_analytics_report_requests`
- `create_analytics_report_request`
- `get_analytics_report_request_status`
- `diagnose_analytics_pipeline`
- `list_analytics_reports`
- `list_analytics_report_instances`
- `list_analytics_report_segments`
- `download_analytics_report_segment`
- `reset_analytics_report_request`

### Sales and finance tools

- `download_sales_report`
- `summarize_app_sales_report`
- `download_finance_report`

### Metadata tools

- `update_app_info_localization`
- `update_app_store_version_localization`

## Security

This project is designed to avoid storing credentials in source control.

- Do not commit `.env`
- Do not commit `*.p8`
- Store your App Store Connect private key outside the repository
- Use `dryRun=true` before any metadata update
- Real metadata changes require `dryRun=false` and `confirm=true`

The server only reads credentials from environment variables:

- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_PATH`
- `APP_STORE_CONNECT_VENDOR_NUMBER`

## Project structure

```text
src/
  index.ts
  config.ts
  auth.ts
  client.ts
  types.ts
  tools/
    apps.ts
    analytics.ts
    metadata.ts
    shared.ts
```

## Requirements

- Node.js 20+
- An App Store Connect API key
- Access to the App Store Connect API for your Apple account

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

Copy `.env.example` to `.env` and fill in your own values:

```bash
cp .env.example .env
```

Example:

```env
APP_STORE_CONNECT_ISSUER_ID=YOUR_ISSUER_ID
APP_STORE_CONNECT_KEY_ID=YOUR_KEY_ID
APP_STORE_CONNECT_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
APP_STORE_CONNECT_VENDOR_NUMBER=YOUR_VENDOR_NUMBER
```

### 3. Build

```bash
npm run build
```

## Run locally

Development:

```bash
npm run dev
```

Production build:

```bash
npm start
```

## Remote mode (Streamable HTTP)

By default the server talks over stdio. Set `MCP_TRANSPORT=http` to serve it over
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http)
instead, so it can sit behind an API gateway (for example Tyk MCP Gateway) or be deployed remotely.

| Variable | Default | Description |
| --- | --- | --- |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` | `127.0.0.1` | Interface to bind. Use `0.0.0.0` in a container |
| `MCP_HTTP_PORT` | `8000` | Port to listen on |
| `MCP_HTTP_PATH` | `/mcp` | MCP endpoint path |
| `MCP_HTTP_SECRET` | — | Required in HTTP mode, at least 16 characters |

Every request to the MCP endpoint must carry the secret in an `X-Upstream-Secret` header,
otherwise it gets `401`. The idea is that only your gateway knows the secret and injects the
header on its upstream requests, so clients cannot bypass the gateway even if they learn the
server's address. `GET /health` is unauthenticated and returns `{"status":"ok"}`.

```bash
export MCP_HTTP_SECRET=$(openssl rand -hex 32)
npm run start:http
```

The server runs in stateless mode: each request gets a fresh MCP server instance, so it can
be scaled horizontally without sticky sessions.

## Scripts

- `npm run dev` — run the server from TypeScript source
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — start the built MCP server
- `npm run start:http` — start the built MCP server over Streamable HTTP
- `npm run test:connection` — test the App Store Connect connection
- `npm run inspect` — run a local MCP client against the server

## Claude Code setup

### Option 1: project-scoped config

This repository includes a shareable `.mcp.json`:

```json
{
  "mcpServers": {
    "app-store-connect": {
      "command": "npm",
      "args": ["start"]
    }
  }
}
```

If Claude Code is opened in this project, it can use that project config.

### Option 2: user-scoped config

```bash
claude mcp add app-store-connect -s user \
  -e APP_STORE_CONNECT_ISSUER_ID=YOUR_ISSUER_ID \
  -e APP_STORE_CONNECT_KEY_ID=YOUR_KEY_ID \
  -e APP_STORE_CONNECT_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8 \
  -- node /absolute/path/to/app-store-connect-mcp/dist/index.js
```

## Claude Desktop setup

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "app-store-connect": {
      "command": "node",
      "args": [
        "/absolute/path/to/app-store-connect-mcp/dist/index.js"
      ],
      "env": {
        "APP_STORE_CONNECT_ISSUER_ID": "YOUR_ISSUER_ID",
        "APP_STORE_CONNECT_KEY_ID": "YOUR_KEY_ID",
        "APP_STORE_CONNECT_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey_XXXXXXXXXX.p8"
      }
    }
  }
}
```

Restart Claude Desktop after saving the config.

## Example prompts

Try these in Claude:

- `Run the list_apps tool and show my apps`
- `Use get_app for a specific app ID`
- `Use list_app_infos for app 123456789 and include localizations`
- `Use get_app_info_localizations for a specific app info ID`
- `Use get_app_store_versions for app 123456789 and include localizations`
- `List analytics report requests for app 123456789`
- `Create an ONGOING analytics report request for app 123456789`
- `Diagnose the analytics pipeline for app 123456789`
- `Get analytics request status for request abc123`
- `Reset analytics report request abc123 for app 123456789 as ONGOING`
- `Summarize the latest SALES summary report for app 123456789`
- `Download the SUBSCRIPTION daily report for my vendor number`
- `Run update_app_info_localization in dry run mode to compare a title or subtitle change`
- `Run update_app_store_version_localization in dry run mode and compare the proposed changes`

## Troubleshooting analytics reports

If App Store Connect shows Analytics data in the web UI but MCP cannot download analytics reports, the usual cause is that Apple hasn't generated report instances yet for the Analytics Reports API.

Recommended workflow:

1. Run `diagnose_analytics_pipeline` for the app ID.
2. If the result is `NO_REQUEST`, create an `ONGOING` request.
3. If the result is `NO_INSTANCES`, wait 1-2 days after the request was created. Apple documents that the first request can take that long before instances appear.
4. If the result is `STOPPED_DUE_TO_INACTIVITY`, use `reset_analytics_report_request` to replace the inactive request.
5. If you need older backfill, create a `ONE_TIME_SNAPSHOT` request. Apple allows one snapshot request per month.

Important notes from Apple:

- The first time a report type is requested, an Admin role may be required.
- Once a report type has been requested, Sales and Reports or Finance roles can download generated reports.
- Report instances expire after 35 days, so historical recovery may require a new `ONE_TIME_SNAPSHOT` request.

## Notes on permissions

Different App Store Connect API roles can unlock different endpoints.

- App metadata and localization work typically require `App Manager` or broader
- Analytics report management may require `Admin`, depending on the endpoint
- Sales and Trends reports typically require `Sales and Reports`
- Finance reports typically require `Finance`

If a tool returns `403 FORBIDDEN_ERROR`, check the role attached to your App Store Connect API key.

## Output behavior

- In stdio mode, `stdout` is reserved for MCP protocol traffic
- Logs are sent to `stderr`
- Credentials and private key contents are never printed by this project

## License

MIT
