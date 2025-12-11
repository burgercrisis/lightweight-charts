import { resolve } from 'path';
import { defineConfig } from 'vite';
const input = {
	main: resolve(__dirname, '../index.html'),
	terminal: resolve(__dirname, './terminal.html'),
};

export default defineConfig({
	base: './',
	server: {
		port: 3003,
		open: true,
	},
	resolve: {
		alias: {
			'lightweight-charts': resolve(__dirname, '../../dist/lightweight-charts.development.mjs'),
		},
	},
	build: {
		rollupOptions: {
			input,
		},
	},
});
