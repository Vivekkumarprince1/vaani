import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => ({
	resolve: {
		alias: {
			'#lib': new URL('./src/lib', import.meta.url).pathname
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:8080',
				changeOrigin: true
			},
			'/ws': {
				target: 'ws://localhost:8080',
				ws: true
			}
		}
	},
	build: isSsrBuild
		? undefined
		: {
			chunkSizeWarningLimit: 600,
			rolldownOptions: {
				output: {
					codeSplitting: {
						groups: [
							{
								name: 'livekit',
								test: /node_modules[\\/]livekit-client[\\/]/,
								minSize: 0,
								maxSize: 250000,
								priority: 100
							}
						]
					}
				}
			}
		}
}));
