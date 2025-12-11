import type { UTCTimestamp } from 'lightweight-charts';

export type DecompositionModel = 'additive' | 'multiplicative';

export interface LineData {
	time: UTCTimestamp;
	value: number;
}

export interface DecompositionConfig {
	trendLength: number;
	seasonLength: number;
	seasonSmoothing?: number;
	normalizeSeasonality?: boolean;
	residualStdWindow?: number;
	standardizeResiduals?: boolean;
	model?: DecompositionModel;
}

export interface DecompositionPoint {
	time: UTCTimestamp;
	value: number | null;
}

export interface DecompositionResult {
	trend: DecompositionPoint[];
	seasonal: DecompositionPoint[];
	residual: DecompositionPoint[];
}

export function computeDecomposition(
	lineData: LineData[],
	config: DecompositionConfig
): DecompositionResult {
	const n = lineData.length;
	if (n === 0) {
		return { trend: [], seasonal: [], residual: [] };
	}

	const trendLength = Math.max(3, Math.floor(config.trendLength));
	const seasonLength = Math.max(2, Math.floor(config.seasonLength));
	const seasonSmoothing = Math.max(1, Math.floor(config.seasonSmoothing ?? 1));
	const residualStdWindow = Math.max(5, Math.floor(config.residualStdWindow ?? 100));
	const standardizeResiduals = config.standardizeResiduals ?? true;
	let model: DecompositionModel = config.model ?? 'additive';

	const times = lineData.map(d => d.time);
	const yRaw = lineData.map(d => d.value);

	if (model === 'multiplicative') {
		const hasNonPositive = yRaw.some(v => v <= 0 || !Number.isFinite(v));
		if (hasNonPositive) {
			model = 'additive';
		}
	}

	const y = model === 'multiplicative' ? yRaw.map(v => Math.log(v)) : yRaw.slice();

	const trendVals = centeredMovingAverage(y, trendLength);
	const detrended: (number | null)[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const t = trendVals[i];
		const v = y[i];
		if (t == null || !Number.isFinite(t) || !Number.isFinite(v)) {
			detrended[i] = null;
		} else {
			detrended[i] = v - t;
		}
	}

	const seasonalPattern = computeSeasonalPattern(
		detrended,
		seasonLength,
		seasonSmoothing,
		config.normalizeSeasonality !== false
	);

	const seasonalVals: (number | null)[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const t = trendVals[i];
		const v = y[i];
		if (t == null || !Number.isFinite(t) || !Number.isFinite(v)) {
			seasonalVals[i] = null;
		} else {
			const idx = i % seasonLength;
			seasonalVals[i] = seasonalPattern[idx];
		}
	}

	const residualVals: (number | null)[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const t = trendVals[i];
		const s = seasonalVals[i];
		const v = y[i];
		if (
			t == null ||
			s == null ||
			!Number.isFinite(t) ||
			!Number.isFinite(s) ||
			!Number.isFinite(v)
		) {
			residualVals[i] = null;
		} else {
			residualVals[i] = v - t - s;
		}
	}

	const residualStd = standardizeResiduals
		? standardizeResidual(residualVals, residualStdWindow)
		: residualVals;

	const trend: DecompositionPoint[] = new Array(n);
	const seasonal: DecompositionPoint[] = new Array(n);
	const residual: DecompositionPoint[] = new Array(n);

	if (model === 'multiplicative') {
		for (let i = 0; i < n; i++) {
			const t = trendVals[i];
			trend[i] = {
				time: times[i],
				value: t == null || !Number.isFinite(t) ? null : Math.exp(t),
			};
			seasonal[i] = {
				time: times[i],
				value: seasonalVals[i],
			};
			residual[i] = {
				time: times[i],
				value: residualStd[i],
			};
		}
	} else {
		for (let i = 0; i < n; i++) {
			trend[i] = {
				time: times[i],
				value: trendVals[i] ?? null,
			};
			seasonal[i] = {
				time: times[i],
				value: seasonalVals[i],
			};
			residual[i] = {
				time: times[i],
				value: residualStd[i],
			};
		}
	}

	return { trend, seasonal, residual };
}

function centeredMovingAverage(values: number[], length: number): (number | null)[] {
	const n = values.length;
	const result: (number | null)[] = new Array(n).fill(null);
	const half = Math.floor(length / 2);
	const window = length;

	for (let i = 0; i < n; i++) {
		const start = i - half;
		const end = start + window;
		if (start < 0 || end > n) {
			continue;
		}
		let sum = 0;
		let count = 0;
		for (let j = start; j < end; j++) {
			const v = values[j];
			if (Number.isFinite(v)) {
				sum += v;
				count++;
			}
		}
		if (count === window) {
			result[i] = sum / count;
		}
	}

	return result;
}

function computeSeasonalPattern(
	detrended: (number | null)[],
	period: number,
	smoothing: number,
	normalize: boolean
): number[] {
	const sums = new Array(period).fill(0);
	const counts = new Array(period).fill(0);

	for (let i = 0; i < detrended.length; i++) {
		const v = detrended[i];
		if (v == null || !Number.isFinite(v)) {
			continue;
		}
		const idx = i % period;
		sums[idx] += v;
		counts[idx]++;
	}

	const pattern = new Array(period).fill(0);
	for (let k = 0; k < period; k++) {
		if (counts[k] > 0) {
			pattern[k] = sums[k] / counts[k];
		}
	}

	if (smoothing > 1) {
		const smoothed = new Array(period).fill(0);
		const half = Math.floor(smoothing / 2);
		for (let k = 0; k < period; k++) {
			let sum = 0;
			let count = 0;
			for (let offset = -half; offset <= half; offset++) {
				const idx = (k + offset + period) % period;
				sum += pattern[idx];
				count++;
			}
			smoothed[k] = sum / count;
		}
		for (let k = 0; k < period; k++) {
			pattern[k] = smoothed[k];
		}
	}

	if (normalize) {
		let mean = 0;
		for (let k = 0; k < period; k++) {
			mean += pattern[k];
		}
		mean /= period;
		for (let k = 0; k < period; k++) {
			pattern[k] -= mean;
		}
	}

	return pattern;
}

function standardizeResidual(
	residual: (number | null)[],
	window: number
): (number | null)[] {
	const n = residual.length;
	const result: (number | null)[] = new Array(n).fill(null);

	for (let i = 0; i < n; i++) {
		const start = i - window + 1;
		if (start < 0) {
			continue;
		}
		let sum = 0;
		let sumSq = 0;
		let count = 0;
		for (let j = start; j <= i; j++) {
			const v = residual[j];
			if (v == null || !Number.isFinite(v)) {
				continue;
			}
			sum += v;
			sumSq += v * v;
			count++;
		}
		if (count < 2) {
			continue;
		}
		const mean = sum / count;
		const variance = sumSq / count - mean * mean;
		const std = Math.sqrt(Math.max(variance, 0));
		const current = residual[i];
		if (std === 0 || current == null || !Number.isFinite(current)) {
			result[i] = null;
		} else {
			result[i] = (current - mean) / std;
		}
	}

	return result;
}
