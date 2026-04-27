# Rampart

A Cloudflare WAF Custom Rules manager built for bulk operations across zones, built with SvelteKit and deployed on Cloudflare Pages.

Rampart provides a single interface for viewing, editing, creating, importing, exporting, and copying firewall rules between zones with a visual expression builder and cross-zone copy support.

## Features

- View, create, edit, and delete WAF custom rules for any zone
- Expression editor with syntax highlighting and a visual field/operator/value builder
- Support for all WAF actions: Block, Managed Challenge, JS Challenge, Interactive Challenge, Skip, Log
- Configure custom block responses (status code, content type, body)
- Cross-zone rule copying with multi-zone target selection
- Import and export rules as JSON or plain text
- Cloudflare Lists integration with automatic list loading for IP, hostname, and ASN lists

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
   bun install
   ```

2. Create a `.env` file from the example and add your API token:

   ```sh
   copy .env.example .env
   ```

3. Start the development server:

   ```sh
   bun run dev
   ```

## Deployment

Build and deploy to Cloudflare Pages:

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
    types.ts        # TypeScript interfaces
  routes/
    +page.svelte    # Main application page
    +layout.svelte  # App shell and layout
    layout.css      # Global styles
    api/            # Server-side API proxy routes
```

## License

MIT
