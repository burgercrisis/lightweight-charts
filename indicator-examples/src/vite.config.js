import { resolve } from 'path';
import { defineConfig } from 'vite';
import { globby } from 'globby';

const paths = (await globby(['./src/**/*.html'])).map(path =>
	path.replace('./src/', '')
);

const input = {
	main: resolve(__dirname, '../index.html'),
};

let count = 0;
paths.forEach(p => {
	input[count++] = resolve(__dirname, p);
});

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
