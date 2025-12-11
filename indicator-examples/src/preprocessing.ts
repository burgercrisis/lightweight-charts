export interface NumericPoint<TTime = number> {
	readonly time: TTime;
	readonly value: number | null;
}

export type NumericSeries<TTime = number> = readonly NumericPoint<TTime>[];

export type MissingValueStrategy =
	| 'none'
	| 'forward_fill'
	| 'backward_fill'
	| 'interpolate'
	| 'constant'
	| 'drop_rows';

export interface MissingValuesConfig {
	enabled: boolean;
	strategy: MissingValueStrategy;
	constantValue?: number;
}

export type OutlierMethod =
	| 'none'
	| 'zscore_clip'
	| 'iqr_clip'
	| 'winsorize'
	| 'manual_clip';

export interface OutlierConfig {
	enabled: boolean;
	method: OutlierMethod;
	zThreshold?: number;
	// Multiplier for IQR, e.g. 1.5
	iqrMultiplier?: number;
	// Percentiles for winsorization (0-100)
	winsorLowerPercentile?: number;
	winsorUpperPercentile?: number;
	manualMin?: number;
	manualMax?: number;
}

export type SmoothingMethod = 'none' | 'moving_average';

export interface SmoothingConfig {
	enabled: boolean;
	method: SmoothingMethod;
	windowSize: number;
	center?: boolean;
	minPeriods?: number;
}

export interface DifferencingConfig {
	enabled: boolean;
	order: 0 | 1;
	seasonalPeriod?: number;
	dropNaAfterDiff?: boolean;
}

export type ScalingMethod = 'none' | 'standard' | 'minmax' | 'robust';

export interface ScalingConfig {
	enabled: boolean;
	method: ScalingMethod;
	rangeMin?: number;
	rangeMax?: number;
}

export interface PreprocessingConfig {
	enabled: boolean;
	missingValues: MissingValuesConfig;
	outliers: OutlierConfig;
	smoothing: SmoothingConfig;
	differencing: DifferencingConfig;
	scaling: ScalingConfig;
}

function isMissing(value: number | null): boolean {
	return value === null || Number.isNaN(value);
}

function cloneSeries<TTime>(series: NumericSeries<TTime>): NumericPoint<TTime>[] {
	return series.map(p => ({ time: p.time, value: p.value }));
}

export function applyPreprocessing<TTime = number>(
	series: NumericSeries<TTime>,
	config: PreprocessingConfig
): NumericSeries<TTime> {
	if (!config.enabled) {
		return series;
	}

	let result: NumericPoint<TTime>[] = cloneSeries(series);

	if (config.missingValues.enabled) {
		result = applyMissingValues(result, config.missingValues);
	}

	if (config.outliers.enabled) {
		result = applyOutliers(result, config.outliers);
	}

	if (config.smoothing.enabled) {
		result = applySmoothing(result, config.smoothing);
	}

	if (config.differencing.enabled && config.differencing.order > 0) {
		result = applyDifferencing(result, config.differencing);
	}

	if (config.scaling.enabled) {
		result = applyScaling(result, config.scaling);
	}

	return result;
}

export function applyMissingValues<TTime = number>(
	series: NumericSeries<TTime>,
	config: MissingValuesConfig
): NumericPoint<TTime>[] {
	if (config.strategy === 'none') {
		return cloneSeries(series);
	}

	if (config.strategy === 'drop_rows') {
		return series.filter(p => !isMissing(p.value));
	}

	const result = cloneSeries(series);

	if (config.strategy === 'constant') {
		const fill = config.constantValue ?? 0;
		for (const p of result) {
			if (isMissing(p.value)) {
				(p as { value: number | null }).value = fill;
			}
		}
		return result;
	}

	if (config.strategy === 'forward_fill' || config.strategy === 'backward_fill') {
		let lastSeen: number | null = null;
		const indices =
			config.strategy === 'forward_fill'
				? [...result.keys()]
				: [...result.keys()].reverse();

		for (const idx of indices) {
			const p = result[idx];
			if (!isMissing(p.value)) {
				lastSeen = p.value;
			} else if (lastSeen !== null) {
				(p as { value: number | null }).value = lastSeen;
			}
		}
		return result;
	}

	// interpolate
	const n = result.length;
	let start = 0;
	while (start < n) {
		while (start < n && isMissing(result[start]?.value ?? null)) {
			start++;
		}
		let end = start + 1;
		while (end < n && isMissing(result[end]?.value ?? null)) {
			end++;
		}

		if (start >= n || end >= n) {
			break;
		}

		const vStart = result[start].value;
		const vEnd = result[end].value;
		if (vStart === null || vEnd === null) {
			start = end;
			continue;
		}

		const gap = end - start;
		for (let i = start + 1; i < end; i++) {
			const t = (i - start) / gap;
			(result[i] as { value: number | null }).value = vStart + t * (vEnd - vStart);
		}

		start = end;
	}

	return result;
}

function collectValues<TTime>(series: NumericSeries<TTime>): number[] {
	const values: number[] = [];
	for (const p of series) {
		if (!isMissing(p.value)) {
			values.push(p.value as number);
		}
	}
	return values;
}

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) {
		return NaN;
	}
	const pos = (sorted.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	if (sorted[base + 1] !== undefined) {
		return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
	}
	return sorted[base];
}

export function applyOutliers<TTime = number>(
	series: NumericSeries<TTime>,
	config: OutlierConfig
): NumericPoint<TTime>[] {
	if (config.method === 'none') {
		return cloneSeries(series);
	}

	const result = cloneSeries(series);
	const values = collectValues(series);
	if (values.length === 0) {
		return result;
	}

	values.sort((a, b) => a - b);

	let lower: number;
	let upper: number;

	if (config.method === 'zscore_clip') {
		const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
		const variance =
			values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
		const std = Math.sqrt(variance) || 1;
		const z = config.zThreshold ?? 3;
		lower = mean - z * std;
		upper = mean + z * std;
	} else if (config.method === 'iqr_clip') {
		const q1 = quantile(values, 0.25);
		const q3 = quantile(values, 0.75);
		const iqr = q3 - q1;
		const k = config.iqrMultiplier ?? 1.5;
		lower = q1 - k * iqr;
		upper = q3 + k * iqr;
	} else if (config.method === 'winsorize') {
		const lp = (config.winsorLowerPercentile ?? 1) / 100;
		const up = (config.winsorUpperPercentile ?? 99) / 100;
		lower = quantile(values, lp);
		upper = quantile(values, up);
	} else {
		lower = config.manualMin ?? Math.min(...values);
		upper = config.manualMax ?? Math.max(...values);
	}

	for (const p of result) {
		if (!isMissing(p.value)) {
			const v = p.value as number;
			const clipped = Math.min(Math.max(v, lower), upper);
			(p as { value: number | null }).value = clipped;
		}
	}

	return result;
}

export function applySmoothing<TTime = number>(
	series: NumericSeries<TTime>,
	config: SmoothingConfig
): NumericPoint<TTime>[] {
	if (config.method === 'none' || config.windowSize <= 1) {
		return cloneSeries(series);
	}

	const window = Math.max(1, Math.floor(config.windowSize));
	const minPeriods = config.minPeriods ?? 1;
	const centered = config.center ?? false;
	const n = series.length;
	const result: NumericPoint<TTime>[] = cloneSeries(series);

	for (let i = 0; i < n; i++) {
		let start: number;
		let end: number;
		if (centered) {
			const half = Math.floor(window / 2);
			start = Math.max(0, i - half);
			end = Math.min(n, i + half + 1);
		} else {
			start = Math.max(0, i - window + 1);
			end = i + 1;
		}

		let sum = 0;
		let count = 0;
		for (let j = start; j < end; j++) {
			const v = series[j]?.value ?? null;
			if (!isMissing(v)) {
				sum += v as number;
				count++;
			}
		}

		if (count >= minPeriods && count > 0) {
			(result[i] as { value: number | null }).value = sum / count;
		}
	}

	return result;
}

export function applyDifferencing<TTime = number>(
	series: NumericSeries<TTime>,
	config: DifferencingConfig
): NumericPoint<TTime>[] {
	if (!config.enabled || config.order === 0) {
		return cloneSeries(series);
	}

	const lag = config.seasonalPeriod && config.seasonalPeriod > 0 ? config.seasonalPeriod : 1;
	const n = series.length;
	const result: NumericPoint<TTime>[] = [];

	for (let i = 0; i < n; i++) {
		const current = series[i];
		if (i < lag || isMissing(current.value) || isMissing(series[i - lag]?.value ?? null)) {
			if (!config.dropNaAfterDiff) {
				result.push({ time: current.time, value: null });
			}
			continue;
		}
		const prev = series[i - lag];
		const diff = (current.value as number) - (prev.value as number);
		result.push({ time: current.time, value: diff });
	}

	return result;
}

export function applyScaling<TTime = number>(
	series: NumericSeries<TTime>,
	config: ScalingConfig
): NumericPoint<TTime>[] {
	if (!config.enabled || config.method === 'none') {
		return cloneSeries(series);
	}

	const values = collectValues(series);
	if (values.length === 0) {
		return cloneSeries(series);
	}

	let transform: (v: number) => number;

	if (config.method === 'standard') {
		const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
		const variance =
			values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
		const std = Math.sqrt(variance) || 1;
		transform = v => (v - mean) / std;
	} else if (config.method === 'minmax') {
		const min = Math.min(...values);
		const max = Math.max(...values);
		const fromRange = max - min || 1;
		const toMin = config.rangeMin ?? 0;
		const toMax = config.rangeMax ?? 1;
		const toRange = toMax - toMin || 1;
		transform = v => ((v - min) / fromRange) * toRange + toMin;
	} else {
		const q1 = quantile(values, 0.25);
		const q3 = quantile(values, 0.75);
		const iqr = q3 - q1 || 1;
		transform = v => (v - q1) / iqr;
	}

	const result = cloneSeries(series);
	for (const p of result) {
		if (!isMissing(p.value)) {
			(p as { value: number | null }).value = transform(p.value as number);
		}
	}

	return result;
}
