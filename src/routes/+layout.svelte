<script lang="ts">
	import './layout.css';

	let { children } = $props();
	const currentYear = new Date().getFullYear();

	function resetToHome(event: MouseEvent): void {
		event.preventDefault();
		window.location.assign('/');
	}
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon.png" />
	<title>RAMPART - WAF Custom Rules</title>
	<meta
		name="description"
		content="Bulk import, export, and manage Cloudflare WAF custom rules across zones."
	/>
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<div class="brand-block">
			<h1><a href="/" onclick={resetToHome}>RAMPART</a></h1>
			<span class="brand-kicker">Cloudflare WAF Custom Rules Manager</span>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer class="muted" style="margin-top: 0.7rem; text-align: center;">
		&copy; {currentYear} Chris K. Harris ·
		<a href="https://github.com/ckh-rcit" target="_blank" rel="noreferrer">GitHub</a>
	</footer>
</div>
