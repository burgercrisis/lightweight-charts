import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildRangeBars,
	buildRenkoBricks,
	buildKagiLines,
} from '../src/price-modes-helpers.js';

import {
	mapToBase,
	mapHistToBase,
	mapVolumeToBase,
} from '../src/mapping-helpers.js';

function makeFlatBars(count, basePrice = 100) {
	const out = [];
	for (let i = 0; i < count; i++) {
		out.push({
			time: i,
			open: basePrice,
			high: basePrice,
			low: basePrice,
			close: basePrice,
			customValues: { volume: 1 },
		});
	}
	return out;
}

function makeTrendBars(steps) {
	const out = [];
	let price = 100;
	for (let i = 0; i < steps.length; i++) {
		price += steps[i];
		const open = price - steps[i];
		const close = price;
		const high = Math.max(open, close);
		const low = Math.min(open, close);
		out.push({
			time: i,
			open,
			high,
			low,
			close,
			customValues: { volume: 1 },
		});
	}
	return out;
}

describe('Synthetic price modes: Range / Renko / Kagi', () => {
	it('buildRangeBars returns at most input length and preserves last time', () => {
		const src = makeFlatBars(5, 100);
		const out = buildRangeBars(src, 10, '5m');
		assert.ok(out.length > 0 && out.length <= src.length);
		const last = out[out.length - 1];
		assert.equal(last.time, src[src.length - 1].time);
	});

	it('buildRenkoBricks produces monotonically increasing times and fixed brick size', () => {
		const src = makeTrendBars([5, 5, 5, 5, -5, -5, -5, -5]);
		const boxSize = 5;
		const bricks = buildRenkoBricks(src, boxSize, '5m');
		assert.ok(bricks.length > 0);
		for (let i = 1; i < bricks.length; i++) {
			assert.ok(
				bricks[i].time > bricks[i - 1].time,
				'brick times must be strictly increasing'
			);
			const step = Math.abs(bricks[i].close - bricks[i].open);
			assert.equal(step, boxSize);
		}
	});

	it('buildKagiLines emits at least one line on directional moves', () => {
		const src = makeTrendBars([5, 5, -5, -5, 5, 5]);
		const lines = buildKagiLines(src, 5, '5m');
		assert.ok(lines.length > 0 && lines.length <= src.length);
		for (const line of lines) {
			assert.equal(typeof line.time, 'number');
			assert.equal(typeof line.open, 'number');
			assert.equal(typeof line.close, 'number');
		}
	});
});

describe('Mapping helpers: index-suffix alignment', () => {
	it('mapToBase maps suffix of points onto base by index', () => {
		const base = [{ time: 1 }, { time: 2 }, { time: 3 }, { time: 4 }];
		const points = [
			{ time: 10, value: 100 },
			{ time: 11, value: 200 },
		];
		const mapped = mapToBase(base, points);
		assert.deepEqual(mapped, [null, null, 100, 200]);
	});

	it('mapToBase keeps distinct values even when times repeat (Renko-style)', () => {
		const base = [{ time: 1 }, { time: 1 }, { time: 1 }];
		const points = [
			{ time: 1, value: 5 },
			{ time: 1, value: 6 },
			{ time: 1, value: 7 },
		];
		const mapped = mapToBase(base, points);
		assert.deepEqual(mapped, [5, 6, 7]);
	});

	it('mapHistToBase aligns histogram values and colors', () => {
		const base = [{ time: 1 }, { time: 2 }, { time: 3 }];
		const hist = [
			{ time: 100, value: 1, color: 'red' },
			{ time: 101, value: -2, color: 'green' },
		];
		const mapped = mapHistToBase(base, hist);
		assert.equal(mapped.length, 3);
		assert.equal(mapped[0], null);
		assert.deepEqual(mapped[1], { value: 1, itemStyle: { color: 'red' } });
		assert.deepEqual(mapped[2], { value: -2, itemStyle: { color: 'green' } });
	});

	it('mapVolumeToBase normalizes volume and preserves order', () => {
		const base = [{ time: 1 }, { time: 2 }];
		const volumePoints = [
			{ time: 10, value: 100, color: 'a' },
			{ time: 11, value: 200, color: 'b' },
		];
		const mapped = mapVolumeToBase(base, volumePoints);
		assert.equal(mapped.length, 2);
		assert.ok(mapped[0] && mapped[1]);
		const v0 = mapped[0].value;
		const v1 = mapped[1].value;
		// second should be approximately double the first (100 vs 200, same scale)
		assert.ok(Math.abs(v1 - 2 * v0) < 1e-9);
		assert.equal(mapped[0].itemStyle.color, 'a');
		assert.equal(mapped[1].itemStyle.color, 'b');
	});
});
