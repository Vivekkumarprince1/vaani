<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { callStore } from '$lib/stores/call.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import IncomingCallModal from '$lib/components/IncomingCallModal.svelte';
	import VideoRoom from '$lib/components/VideoRoom.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		themeStore.init();
		authStore.init();
		callStore.initListeners();
		chatStore.initListeners();
	});
</script>

<svelte:head>
	<title>Vaani v2 — Multilingual Real-Time Communication Platform</title>
</svelte:head>

<div class="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-200">
	{@render children()}

	<!-- Global Incoming Call Ringing Dialog -->
	<IncomingCallModal />

	<!-- Global Unified Video Calling Screen -->
	<VideoRoom />
</div>
