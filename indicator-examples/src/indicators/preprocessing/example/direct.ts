import {
	CandlestickSeries,
	ChartOptions,
	DeepPartial,
	LineSeries,
	UTCTimestamp,
	createChart,
} from 'lightweight-charts';
import { convertToLineData, generateAlternativeCandleData } from '../../../sample-data';
import {
	applyPreprocessing,
	PreprocessingConfig,
	NumericSeries,
} from '../../../preprocessing';

interface LinePoint {
	time: UTCTimestamp;
	value: number;
}

function toNumericSeries(points: LinePoint[]): NumericSeries<UTCTimestamp> {
	return points.map(p => ({ time: p.time, value: p.value }));
}

function fromNumericSeries(series: NumericSeries<UTCTimestamp>): LinePoint[] {
	const result: LinePoint[] = [];
	for (const p of series) {
		if (p.value !== null && !Number.isNaN(p.value)) {
			result.push({ time: p.time as UTCTimestamp, value: p.value as number });
		}
	}
	return result;
}

const chartOptions = {
	autoSize: true,
} satisfies DeepPartial<ChartOptions>;

const chart = createChart('chart', chartOptions);

const candles = generateAlternativeCandleData(250, new Date(2024, 0, 1));
const candleSeries = chart.addSeries(CandlestickSeries, {});
candleSeries.setData(candles);

// Derive a noisy line series from close prices
const baseLine = convertToLineData(candles) as LinePoint[];
const rawLine: LinePoint[] = baseLine.map((p, index) => {
	let value = p.value;
	// Inject a few synthetic spikes so outlier clipping / smoothing are visible
	if (index % 60 === 0) {
		value = value * 4;
	}
	return { time: p.time, value };
});

const rawSeries = chart.addSeries(LineSeries, {
	color: 'rgba(148, 163, 184, 0.7)',
	lineWidth: 1,
});
rawSeries.setData(rawLine);

const cleanedSeries = chart.addSeries(LineSeries, {
	color: 'rgba(56, 189, 248, 1)',
	lineWidth: 2,
});

let currentConfig: PreprocessingConfig = {
	enabled: true,
	missingValues: {
		enabled: true,
		strategy: 'forward_fill',
	},
	outliers: {
		enabled: false,
		method: 'zscore_clip',
		zThreshold: 3,
	},
	smoothing: {
		enabled: true,
		method: 'moving_average',
		windowSize: 5,
		center: false,
		minPeriods: 1,
	},
	differencing: {
		enabled: false,
		order: 0,
		dropNaAfterDiff: true,
	},
	scaling: {
		enabled: false,
		method: 'none',
	},
};

function updatePreprocessing(): void {
	const numeric: NumericSeries<UTCTimestamp> = toNumericSeries(rawLine);
	const processed: NumericSeries<UTCTimestamp> = applyPreprocessing(numeric, currentConfig);
	const processedLine = fromNumericSeries(processed);
	cleanedSeries.setData(processedLine);
}

function wireControls(): void {
	const enabled = document.getElementById('cfg-enabled') as HTMLInputElement | null;
	const missing = document.getElementById('cfg-missing-enabled') as HTMLInputElement | null;
	const outliers = document.getElementById('cfg-outliers-enabled') as HTMLInputElement | null;
	const smoothing = document.getElementById('cfg-smoothing-enabled') as HTMLInputElement | null;

	if (!enabled || !missing || !outliers || !smoothing) {
		return;
	}

	enabled.checked = currentConfig.enabled;
	missing.checked = currentConfig.missingValues.enabled;
	outliers.checked = currentConfig.outliers.enabled;
	smoothing.checked = currentConfig.smoothing.enabled;

	const handleChange = (): void => {
		currentConfig = {
			...currentConfig,
			enabled: enabled.checked,
			missingValues: {
				...currentConfig.missingValues,
				enabled: missing.checked,
			},
			outliers: {
				...currentConfig.outliers,
				enabled: outliers.checked,
			},
			smoothing: {
				...currentConfig.smoothing,
				enabled: smoothing.checked,
			},
		};
		updatePreprocessing();
	};

	[enabled, missing, outliers, smoothing].forEach(input => {
		input.addEventListener('change', handleChange);
	});
}

wireControls();
updatePreprocessing();
chart.timeScale().fitContent();
