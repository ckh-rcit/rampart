# RAMPART

RAMPART is a Cloudflare WAF Custom Rules manager built for bulk operations across zones. It provides a single interface for viewing, editing, creating, importing, exporting, and copying firewall rules between zones.

## Features

### Manage Rules
- View all WAF custom rules for a selected zone in a sortable table
- Enable or disable individual rules with a toggle
- Expand any rule inline to edit its name, expression, action, and custom block response
- Expression editor with syntax highlighting (fields, operators, logical joins, list references)
- Simple View for building expressions visually with field/operator/value dropdowns
- Automatic parsing of existing expressions into Simple View when possible
- Delete rules with confirmation, then deploy changes with a single save

### Create Rules
- Build new rules with the same expression editor (Expression View or Simple View)
- Select from all WAF actions: Block, Managed Challenge, Interactive Challenge, JS Challenge, Skip, Log
- Configure custom block responses (status code, content type, body) for block actions
- Add multiple rules to a preview table before deploying
- Deploy as append (add to existing rules) or replace (overwrite entire ruleset)

### Cross-Zone Copy
- Select rules from the current zone to copy
- Choose multiple target zones with a filterable checkbox list
- Select All / Deselect All for quick bulk operations
- Rules are appended to each target zone's existing ruleset

### Import and Export
- Export rules as JSON (full metadata payload) or plain text (name | expression | action)
- Import from JSON or text format via file upload or paste
- Imported rules land in the Create tab preview for review before deploying

### Cloudflare Lists Integration
- Automatically loads account-level lists (IP, hostname, ASN, redirect)
- Simple View shows a dropdown of available lists when using "is in list" / "is not in list" operators
- Parses existing `in $list_name` expressions into Simple View

## Requirements

- [Bun](https://bun.sh/) 1.3+
- A Cloudflare API token with the following permissions:
  - **Zone > Zone WAF > Edit** -- read and write custom rules
  - **Zone > Zone > Read** -- list zones
  - **Account > Account Filter Lists > Read** -- load lists (optional, for list dropdown support)

## Local Setup

1. Install dependencies:

```sh
bun install
```

2. Create a local env file and add your API token:

```sh
copy .env.example .env
```

3. Set `CLOUDFLARE_API_TOKEN` in `.env`.

4. Start the development server:

```sh
bun run dev
```

## Deployment

RAMPART runs on Cloudflare Pages via the SvelteKit adapter.

```sh
bun run build
wrangler pages deploy .svelte-kit/cloudflare
```

Set `CLOUDFLARE_API_TOKEN` as a secret in your Pages project settings.

## Tech Stack

- SvelteKit 2 with Svelte 5 (runes mode)
- Tailwind CSS 4
- TypeScript
- Cloudflare Pages (Workers runtime)
- Cloudflare Rulesets API (`http_request_firewall_custom` phase)
