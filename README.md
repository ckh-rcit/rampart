# Rampart

A Cloudflare WAF Custom Rules manager focused on fast rule editing and safe bulk operations across zones. Built with SvelteKit and deployed on Cloudflare Pages.

Rampart provides a single interface for viewing, editing, creating, importing, exporting, copying, removing, and pushing custom firewall rules between zones with an expression editor and Simple View builder.

<img width="1715" height="596" alt="msedge_ZmCmuD1nay" src="https://github.com/user-attachments/assets/7f36f24a-287f-4b09-aac3-ac5cb74586fd" />

## Features

- Manage per-zone rules
   - View, create, edit, validate, and delete WAF custom rules
   - Expression View with syntax highlighting
   - Simple View (field/operator/value builder with AND/OR joins)
   - Tag-chip input for `ip.src` set operators (`in_set`, `not_in_set`)
   - Live compatibility checks (for example CIDR/operator combinations, list names, ASN numeric values)
- Bulk Operations tab
   - Copy Rules: copy selected rules from source zone to selected target zones
   - Remove by Name: search all zones, preview matches, and remove with irreversible confirmation
   - Create and Push: build one new rule (Expression or Simple View), validate once, push to many zones
- WAF rule behavior
   - Supports actions: Block, Managed Challenge, JS Challenge, Interactive Challenge, Skip, Log
   - Custom block responses (status code, content type, body)
- Import and export
   - Export JSON
   - Export plain expressions (`.txt`)
   - Import from JSON or expression text
- Cloudflare Lists integration
   - Account list loading for list operators (`in_list`, `not_in_list`)

## Tech Stack

- SvelteKit 2 with Svelte 5 (runes mode)
- Tailwind CSS 4
- TypeScript
- Cloudflare Pages

## Prerequisites

- [Bun](https://bun.sh/) 1.3 or later
- A Cloudflare API token (see [API Token Permissions](#api-token-permissions))

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

   or

   ```sh
   bun install
   ```

2. Create a `.env` file from the example and add your API token:

   ```sh
   copy .env.example .env
   ```

3. Start the development server:

   ```sh
   npm run dev
   ```

   or

   ```sh
   bun run dev
   ```

## Validation

```sh
npm run check
```

or

```sh
bun run check
```

## Deployment

Build and deploy to Cloudflare Pages:

```sh
npm run build
wrangler pages deploy .svelte-kit/cloudflare
```

or

```sh
bun run build
wrangler pages deploy .svelte-kit/cloudflare
```

Set the API token secret in your Pages project:

```sh
wrangler pages secret put CLOUDFLARE_API_TOKEN
```

## API Token Permissions

| Permission             | Access |
| ---------------------- | ------ |
| Zone                   | Read   |
| Zone WAF               | Edit   |
| Account Filter Lists   | Read   |

## Project Structure

```
src/
  lib/
    cloudflare.ts   # Cloudflare API client
      types.ts        # Shared TypeScript interfaces and editor types
      constants.ts    # Shared constants (actions, match fields/operators, value options)
      utils.ts        # Pure helpers (escaping, labels, highlighting helpers)
      components/
         BulkOperations.svelte  # Bulk copy/remove/create workflows
  routes/
    +page.svelte    # Main application page
    +layout.svelte  # App shell and layout
    layout.css      # Global styles
      api/
         lists/+server.ts                # Account filter lists proxy
         zones/+server.ts                # Zones lookup proxy
         zones/[zoneId]/rules/+server.ts # Zone custom rules read/write proxy
```

## Notes

- The app validates expressions against Cloudflare before deploy/push operations.
- Remove by Name and bulk changes are designed to show preview/progress before destructive operations complete.

## License

MIT
