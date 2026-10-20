<script lang="ts">
	import { authStore } from '#lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { Sparkles, ArrowRight, Lock, User as UserIcon } from 'lucide-svelte';

	let identifier = $state('superadmin@vaani.internal');
	let password = $state('Admin@12345');
	let error = $state<string | null>(null);
	let isSubmitting = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = null;
		isSubmitting = true;

		try {
			await authStore.login(identifier, password);
			const redirectUrl = typeof window !== 'undefined' ? sessionStorage.getItem('vaani_join_redirect') : null;
			if (redirectUrl) {
				sessionStorage.removeItem('vaani_join_redirect');
				goto(redirectUrl);
			} else {
				goto('/dashboard');
			}
		} catch (err: any) {
			error = err.response?.data?.error || 'Invalid email or password';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-black p-4">
	<div class="w-full max-w-md rounded-3xl bg-neutral-900/60 border border-neutral-800/80 p-8 shadow-2xl backdrop-blur-xl">
		<!-- Header -->
		<div class="mb-8 text-center">
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/25">
				<Sparkles class="h-7 w-7 text-white" />
			</div>
			<h1 class="text-2xl font-bold tracking-tight text-white">Vaani v2</h1>
			<p class="mt-1 text-sm text-neutral-400">Next-Gen Real-Time Multilingual Communication</p>
		</div>

		<!-- Error Banner -->
		{#if error}
			<div class="mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3.5 text-center text-sm text-rose-400">
				{error}
			</div>
		{/if}

		<!-- Login Form -->
		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="identifier" class="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">Email or Username</label>
				<div class="relative">
					<UserIcon class="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
					<input
						id="identifier"
						type="text"
						bind:value={identifier}
						required
						placeholder="admin@vaani.internal"
						class="w-full rounded-2xl bg-neutral-800/50 border border-neutral-700/60 py-3 pl-11 pr-4 text-sm text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
					/>
				</div>
			</div>

			<div>
				<label for="password" class="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">Password</label>
				<div class="relative">
					<Lock class="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
					<input
						id="password"
						type="password"
						bind:value={password}
						required
						placeholder="••••••••••••"
						class="w-full rounded-2xl bg-neutral-800/50 border border-neutral-700/60 py-3 pl-11 pr-4 text-sm text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
					/>
				</div>
			</div>

			<button
				type="submit"
				disabled={isSubmitting}
				class="w-full mt-2 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 active:scale-98 transition-all disabled:opacity-50"
			>
				<span>{isSubmitting ? 'Authenticating...' : 'Sign In'}</span>
				<ArrowRight class="h-4 w-4" />
			</button>
		</form>

		<div class="mt-8 text-center text-xs text-neutral-500">
			Don't have an account?
			<a href="/register" class="font-medium text-emerald-400 hover:text-emerald-300 ml-1">Create Account</a>
		</div>
	</div>
</div>
