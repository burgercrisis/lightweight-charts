import * as echarts from 'echarts';
import 'echarts-gl';
import { convertToLineData } from './sample-data';
import { mapToBase, mapHistToBase, mapVolumeToBase } from './mapping-helpers.js';

const container = document.getElementById('chart');
if (!container) {
	throw new Error('Chart container #chart not found');
}

const chart = echarts.init(container, null, { renderer: 'canvas' });
const chartDom = chart.getDom();
const zr = chart.getZr();

const chart3dIndicatorContainer = document.getElementById('chart-3d-indicator');
const chart3dIndicator = chart3dIndicatorContainer
	? echarts.init(chart3dIndicatorContainer, null, { renderer: 'canvas' })
	: null;

const MAX_RENDER_BARS = 2000;
const STREAM_INTERVAL_MS = 1000;
// Keep at least ~5 years of 5-minute bars in memory even with streaming.
// 5 years * 365 days * 288 bars/day ≈ 525,600, so use a slightly higher cap.
const MAX_HISTORY_BARS = 600000;
let streamTimerId = null;
let streamIntervalMs = STREAM_INTERVAL_MS;
let perfPreset = 'normal';
let perfPxPerBar = 6;
let perfMinBars = 200;

function generateRandomWalkCandles({
	points,
	intervalMinutes = 5,
	years = 5,
	startPrice = 1000,
	startDate = new Date(Date.UTC(2018, 0, 1)),
}) {
	const candles = [];
	let lastClose = startPrice;
	let volatility = 0.03; // baseline volatility
	const barMs = intervalMinutes * 60 * 1000;
	const totalPoints =
		typeof points === 'number'
			? points
			: Math.max(1, Math.round(((years * 365 * 24 * 60) / intervalMinutes)));

	for (let i = 0; i < totalPoints; i++) {
		const date = new Date(startDate.getTime() + i * barMs);

		// Occasionally shift volatility regime
		if (Math.random() < 0.04) {
			volatility *= 0.5 + Math.random();
			volatility = Math.min(Math.max(volatility, 0.01), 0.15);
		}

		const drift = (Math.random() - 0.5) * 0.002;
		const shock = (Math.random() * 2 - 1) * volatility;
		const ret = drift + shock;

		const open = lastClose;
		let close = open * (1 + ret);
		if (!Number.isFinite(close) || close <= 0) close = open * 0.98;
		const highBase = Math.max(open, close);
		const lowBase = Math.min(open, close);
		const high = highBase * (1 + Math.random() * 0.03);
		const low = lowBase * (1 - Math.random() * 0.03);
		const volume = Math.round(
			5_000 * (0.5 + Math.random() * 1.5) * (0.7 + volatility / 0.03)
		);

		candles.push({
			time: Math.floor(date.getTime() / 1000),
			open,
			high,
			low,
			close,
			customValues: { volume },
		});

		lastClose = close;
	}

	return candles;
}

function generateNextRandomWalkCandle(lastBar, intervalMinutes = 5) {
	if (!lastBar) {
		return null;
	}
	const barMs = intervalMinutes * 60 * 1000;
	const lastTimeMs = (typeof lastBar.time === 'number' ? lastBar.time : 0) * 1000;
	const date = new Date(lastTimeMs + barMs);
	const lastClose = typeof lastBar.close === 'number' ? lastBar.close : 1000;
	const volatility = 0.03;
	const drift = (Math.random() - 0.5) * 0.002;
	const shock = (Math.random() * 2 - 1) * volatility;
	const ret = drift + shock;
	const open = lastClose;
	let close = open * (1 + ret);
	if (!Number.isFinite(close) || close <= 0) {
		close = open * 0.98;
	}
	const highBase = Math.max(open, close);
	const lowBase = Math.min(open, close);
	const high = highBase * (1 + Math.random() * 0.03);
	const low = lowBase * (1 - Math.random() * 0.03);
	const volume = Math.round(5_000 * (0.5 + Math.random() * 1.5));
	return {
		time: Math.floor(date.getTime() / 1000),
		open,
		high,
		low,
		close,
		customValues: { volume },
	};
}

let baseData = generateRandomWalkCandles({ years: 5 });

const TIMEFRAME_FACTORS = {
	'5m': 1,
	'15m': 3,
	'1h': 12,
	'4h': 48,
	'1d': 288,
};

let timeframe = '5m';
let rangeKey = '30d';
let isLogScale = false;
let chartMode = 'candles';

const toggleCandles = document.getElementById('toggle-candles');
const toggleEMA = document.getElementById('toggle-ema');
const toggleEMA20 = document.getElementById('toggle-ema20');
const toggleEMA100 = document.getElementById('toggle-ema100');
const toggleSMA = document.getElementById('toggle-sma');
const toggleBB = document.getElementById('toggle-bb');
const toggleKeltner = document.getElementById('toggle-keltner');
const toggleIchimoku = document.getElementById('toggle-ichimoku');
const toggleVWAP = document.getElementById('toggle-vwap');
const toggleVolume = document.getElementById('toggle-volume');
const togglePriceLine = document.getElementById('toggle-price-line');
const togglePriceArea = document.getElementById('toggle-price-area');
const toggleDonchian = document.getElementById('toggle-donchian');
const toggleRSI = document.getElementById('toggle-rsi');
const toggleStoch = document.getElementById('toggle-stoch');
const toggleCCI = document.getElementById('toggle-cci');
const toggleBIAS = document.getElementById('toggle-bias');
const toggleMomentum = document.getElementById('toggle-mom');
const toggleROC = document.getElementById('toggle-roc');
const toggleWPR = document.getElementById('toggle-wpr');
const toggleOBV = document.getElementById('toggle-obv');
const toggleVR = document.getElementById('toggle-vr');
const toggleMACD = document.getElementById('toggle-macd');
const togglePSAR = document.getElementById('toggle-psar');
const toggleKDJ = document.getElementById('toggle-kdj');
const toggleATR = document.getElementById('toggle-atr');
const toggleADX = document.getElementById('toggle-adx');
const toggleDMA = document.getElementById('toggle-dma');
const toggleTRIX = document.getElementById('toggle-trix');
const toggleTsdTrend = document.getElementById('toggle-tsd-trend');
const toggleTsdSeasonality = document.getElementById('toggle-tsd-seasonality');
const toggleTsdResidual = document.getElementById('toggle-tsd-residual');
const toggle3DIndicator = document.getElementById('toggle-3d-indicator');
const logToggle = document.getElementById('log-toggle');
const bottomClock = document.getElementById('bottom-clock');
const goLiveButton = document.getElementById('go-live');
const streamToggle = document.getElementById('stream-toggle');
const perfPresetSelect = document.getElementById('perf-preset');
const indicatorToggle = document.getElementById('indicator-toggle');
const indicatorMenu = document.getElementById('indicator-menu');
const indicatorOpenAll = document.getElementById('indicator-open-all');
const indicatorCloseAll = document.getElementById('indicator-close-all');
const tfButtons = Array.from(document.querySelectorAll('.tf-btn'));
const rangeButtons = Array.from(document.querySelectorAll('.range-btn'));
const chartModeButtons = Array.from(document.querySelectorAll('.chart-mode-btn'));
const settingsToggle = document.getElementById('settings-toggle');
const indicatorSettingsPanel = document.getElementById('indicator-settings');
const indicatorSettingsClose = document.getElementById('indicator-settings-close');
const indicatorSettingsTabs = Array.from(
	document.querySelectorAll('.indicator-settings-tab')
);
const indicatorSettingsPageMain = document.getElementById('indicator-settings-page-main');
const indicatorSettingsPage3d = document.getElementById('indicator-settings-page-3d');
const settingEmaLengthInput = document.getElementById('setting-ema-length');
const settingEmaFastLengthInput = document.getElementById('setting-ema-fast-length');
const settingEmaSlowLengthInput = document.getElementById('setting-ema-slow-length');
const settingSmaLengthInput = document.getElementById('setting-sma-length');
const settingDmaFastLengthInput = document.getElementById('setting-dma-fast-length');
const settingDmaSlowLengthInput = document.getElementById('setting-dma-slow-length');
const settingBbLengthInput = document.getElementById('setting-bb-length');
const settingBbMultInput = document.getElementById('setting-bb-mult');
const settingDonchianLengthInput = document.getElementById('setting-donchian-length');
const settingRsiLengthInput = document.getElementById('setting-rsi-length');
const settingStochLengthInput = document.getElementById('setting-stoch-length');
const settingStochSmoothingInput = document.getElementById('setting-stoch-smoothing');
const settingCciLengthInput = document.getElementById('setting-cci-length');
const settingWprLengthInput = document.getElementById('setting-wpr-length');
const settingMomLengthInput = document.getElementById('setting-mom-length');
const settingRocLengthInput = document.getElementById('setting-roc-length');
const settingVrLengthInput = document.getElementById('setting-vr-length');
const settingTrixLengthInput = document.getElementById('setting-trix-length');
const settingTrixSignalInput = document.getElementById('setting-trix-signal');
const settingAtrLengthInput = document.getElementById('setting-atr-length');
const settingAdxLengthInput = document.getElementById('setting-adx-length');
const settingMacdFastInput = document.getElementById('setting-macd-fast');
const settingMacdSlowInput = document.getElementById('setting-macd-slow');
const settingMacdSignalInput = document.getElementById('setting-macd-signal');
const settingKeltnerMaLengthInput = document.getElementById('setting-keltner-ma-length');
const settingKeltnerAtrLengthInput = document.getElementById('setting-keltner-atr-length');
const settingKeltnerMultInput = document.getElementById('setting-keltner-mult');
const settingIchConvInput = document.getElementById('setting-ich-conv');
const settingIchBaseInput = document.getElementById('setting-ich-base');
const settingIchSpanBInput = document.getElementById('setting-ich-spanb');
const settingIchDisplacementInput = document.getElementById('setting-ich-displacement');
const settingBiasLengthInput = document.getElementById('setting-bias-length');
const settingPsarStepInput = document.getElementById('setting-psar-step');
const settingPsarMaxStepInput = document.getElementById('setting-psar-maxstep');
const settingRangeSizeInput = document.getElementById('setting-range-size');
const settingRenkoBoxSizeInput = document.getElementById('setting-renko-box-size');
const settingKagiReversalSizeInput = document.getElementById('setting-kagi-reversal-size');
const setting3dMainZSource = document.getElementById('setting-3d-main-z-source');
const setting3dIndicatorX = document.getElementById('setting-3d-indicator-x');
const setting3dIndicatorY = document.getElementById('setting-3d-indicator-y');
const setting3dIndicatorZ = document.getElementById('setting-3d-indicator-z');
const settingTsdTrendLengthInput = document.getElementById('setting-tsd-trend-length');
const settingTsdSeasonLengthInput = document.getElementById('setting-tsd-season-length');
const settingTsdSeasonSmoothingInput = document.getElementById('setting-tsd-season-smoothing');
const settingTsdResidualStdWindowInput = document.getElementById('setting-tsd-residual-std-window');
const settingTsdModelSelect = document.getElementById('setting-tsd-model');
const settingTsdNormalizeInput = document.getElementById('setting-tsd-normalize');
const settingTsdStandardizeInput = document.getElementById('setting-tsd-standardize');

const indicatorPopup = document.getElementById('indicator-popup');
const indicatorPopupTitle = document.getElementById('indicator-popup-title');
const indicatorPopupBody = document.getElementById('indicator-popup-body');
const indicatorPopupClose = document.getElementById('indicator-popup-close');

const seriesStyleOverrides = Object.create(null);

function hexToRgb(hex) {
	if (typeof hex !== 'string') return null;
	let h = hex.trim();
	if (!h) return null;
	if (h[0] === '#') h = h.slice(1);
	if (h.length === 3) {
		h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	}
	if (h.length !== 6) return null;
	const r = Number.parseInt(h.slice(0, 2), 16);
	const g = Number.parseInt(h.slice(2, 4), 16);
	const b = Number.parseInt(h.slice(4, 6), 16);
	if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
	return { r, g, b };
}

function applySeriesStyleOverrides(series) {
	for (const s of series) {
		if (!s || !s.name) continue;
		const ov = seriesStyleOverrides[s.name];
		if (!ov) continue;
		if (s.type === 'line') {
			if (!s.lineStyle) s.lineStyle = {};
			if (ov.lineColor) {
				s.lineStyle.color = ov.lineColor;
			}
			if (typeof ov.lineWidth === 'number') {
				s.lineStyle.width = ov.lineWidth;
			}
			if (typeof ov.lineOpacity === 'number') {
				s.lineStyle.opacity = ov.lineOpacity;
			}
			if (ov.lineDash) {
				s.lineStyle.type = ov.lineDash;
			}
			const supportsArea =
				s.name === 'Price Area' ||
				s.name === 'Ichimoku Span A' ||
				s.name === 'Ichimoku Span B';
			if (supportsArea && (ov.areaColor || typeof ov.areaOpacity === 'number')) {
				const alpha =
					typeof ov.areaOpacity === 'number' && ov.areaOpacity >= 0 && ov.areaOpacity <= 1
						? ov.areaOpacity
						: undefined;
				const rgb = ov.areaColor ? hexToRgb(ov.areaColor) : null;
				if (rgb && alpha !== undefined) {
					if (!s.areaStyle) s.areaStyle = {};
					s.areaStyle.color = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
				}
			}
		} else if (s.type === 'candlestick' && s.name === 'Price') {
			if (!s.itemStyle) s.itemStyle = {};
			if (ov.upColor) {
				s.itemStyle.color = ov.upColor;
				s.itemStyle.borderColor = ov.upColor;
			}
			if (ov.downColor) {
				s.itemStyle.color0 = ov.downColor;
				s.itemStyle.borderColor0 = ov.downColor;
			}
		} else if (s.type === 'scatter' && s.name === 'Parabolic SAR') {
			if (!s.itemStyle) s.itemStyle = {};
			if (ov.markerColor) {
				s.itemStyle.color = ov.markerColor;
			}
			if (typeof ov.markerOpacity === 'number') {
				s.itemStyle.opacity = ov.markerOpacity;
			}
		} else if (s.type === 'bar' && s.name === 'Volume') {
			if (!s.itemStyle) s.itemStyle = {};
			if (ov.barColor) {
				s.itemStyle.color = ov.barColor;
			}
			if (typeof ov.barOpacity === 'number') {
				s.itemStyle.opacity = ov.barOpacity;
			}
		} else if (s.type === 'bar' && s.name === 'MACD Hist') {
			if (!Array.isArray(s.data)) continue;
			for (const d of s.data) {
				if (!d || typeof d !== 'object') continue;
				const v = typeof d.value === 'number' ? d.value : null;
				if (!d.itemStyle) d.itemStyle = {};
				if (typeof v === 'number') {
					if (ov.barPositiveColor && v >= 0) {
						d.itemStyle.color = ov.barPositiveColor;
					} else if (ov.barNegativeColor && v < 0) {
						d.itemStyle.color = ov.barNegativeColor;
					}
				}
				if (typeof ov.barOpacity === 'number') {
					d.itemStyle.opacity = ov.barOpacity;
				}
			}
		}
	}
}

function aggregateCandlesByFactor(source, factor) {
	const len = Array.isArray(source) ? source.length : 0;
	if (!len || factor <= 1) {
		return source ? source.slice() : [];
	}
	const out = [];
	let bucketIndex = -1;
	let open = 0;
	let high = 0;
	let low = 0;
	let close = 0;
	let volume = 0;
	let time = 0;
	for (let i = 0; i < len; i++) {
		const bar = source[i];
		if (!bar) continue;
		const bIndex = Math.floor(i / factor);
		const barVolume =
			bar.customValues && typeof bar.customValues.volume === 'number'
				? bar.customValues.volume
				: 0;
		if (bIndex !== bucketIndex) {
			if (bucketIndex !== -1) {
				out.push({
					time,
					open,
					high,
					low,
					close,
					customValues: { volume },
				});
			}
			bucketIndex = bIndex;
			open = bar.open;
			high = bar.high;
			low = bar.low;
			close = bar.close;
			volume = barVolume;
			time = bar.time;
		} else {
			if (typeof bar.high === 'number' && bar.high > high) high = bar.high;
			if (typeof bar.low === 'number' && bar.low < low) low = bar.low;
			close = bar.close;
			volume += barVolume;
			time = bar.time;
		}
	}
	if (bucketIndex !== -1) {
		out.push({
			time,
			open,
			high,
			low,
			close,
			customValues: { volume },
		});
	}
	return out;
}

function getTimeframeData() {
	const factor = TIMEFRAME_FACTORS[timeframe] ?? 1;
	if (factor === 1) {
		return baseData;
	}
	return aggregateCandlesByFactor(baseData, factor);
}

function getDynamicMaxBars() {
	const minBars = perfMinBars;
	const hardMax = MAX_RENDER_BARS;
	let width = 0;
	if (container && typeof container.clientWidth === 'number') {
		width = container.clientWidth;
	} else if (typeof window !== 'undefined' && window.innerWidth) {
		width = window.innerWidth;
	} else {
		width = 1200;
	}
	const pxPerBar = perfPxPerBar;
	const estBars = Math.floor(width / pxPerBar);
	if (!Number.isFinite(estBars) || estBars <= 0) {
		return hardMax;
	}
	const target = estBars * 2;
	if (target < minBars) {
		return minBars;
	}
	if (target > hardMax) {
		return hardMax;
	}
	return target;
}

function applyRangeToData(data, key) {
	const len = data.length;
	if (!len) return [];
	if (key === 'all') {
		return data.slice();
	}
	const maxBars = getDynamicMaxBars();
	let bars = len;
	switch (key) {
		case '1d':
			bars = Math.min(40, len);
			break;
		case '7d':
			bars = Math.min(120, len);
			break;
		case '30d':
			bars = Math.min(240, len);
			break;
		case '180d':
			bars = len;
			break;
		default:
			bars = len;
	}
	const fromIndex = Math.max(0, len - bars);
	const sliced = data.slice(fromIndex);
	if (sliced.length <= maxBars) {
		return sliced;
	}
	return sliced.slice(sliced.length - maxBars);
}

function computeVisiblePriceRange(slice, options = {}) {
	if (!Array.isArray(slice) || slice.length === 0) {
		return null;
	}
	const {
		focusRatio = 0.35,
		minFocusBars = 60,
		lowerQuantile = 0.02,
		upperQuantile = 0.98,
		isLogScale = false,
	} = options;
	const focusCount = Math.max(
		minFocusBars,
		Math.floor(slice.length * Math.min(Math.max(focusRatio, 0), 1))
	);
	const focusSlice = slice.slice(-focusCount);
	const samples = [];
	for (const bar of focusSlice) {
		if (typeof bar.low === 'number' && Number.isFinite(bar.low)) {
			samples.push(bar.low);
		}
		if (typeof bar.high === 'number' && Number.isFinite(bar.high)) {
			samples.push(bar.high);
		}
	}
	if (!samples.length) {
		return null;
	}
	samples.sort((a, b) => a - b);
	const clampIndex = value =>
		Math.min(samples.length - 1, Math.max(0, value));
	const lowerIdx = clampIndex(
		Math.floor((samples.length - 1) * lowerQuantile)
	);
	const upperIdx = clampIndex(
		Math.ceil((samples.length - 1) * upperQuantile)
	);
	let lower = samples[lowerIdx];
	let upper = samples[upperIdx];
	if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
		lower = samples[0];
		upper = samples[samples.length - 1];
	}
	if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
		return null;
	}
	if (lower === upper) {
		const offset = Math.max(Math.abs(lower) * 0.01, 1);
		lower -= offset;
		upper += offset;
	}
	let span = upper - lower;
	if (!Number.isFinite(span) || span <= 0) {
		span = Math.max(Math.abs(upper) * 0.05, 1);
	}
	const padding = span * 0.08;
	let min = lower - padding;
	let max = upper + padding;
	if (isLogScale) {
		if (min <= 0) {
			const positiveSample = samples.find(v => v > 0);
			min = positiveSample
				? Math.max(positiveSample * 0.8, 1e-6)
				: 1e-6;
		}
		if (max <= min) {
			max = min * 1.2;
		}
	}
	if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
		return null;
	}
	return { min, max };
}

function estimateAtrRange(candles, length) {
	const len = candles.length;
	if (len < 2) return Number.NaN;
	const trs = [];
	for (let i = 1; i < len; i++) {
		const prev = candles[i - 1];
		const cur = candles[i];
		if (
			typeof cur.high !== 'number' ||
			typeof cur.low !== 'number' ||
			typeof cur.close !== 'number' ||
			typeof prev.close !== 'number'
		) {
			continue;
		}
		const highLow = cur.high - cur.low;
		const highClose = Math.abs(cur.high - prev.close);
		const lowClose = Math.abs(cur.low - prev.close);
		const tr = Math.max(highLow, highClose, lowClose);
		if (Number.isFinite(tr) && tr > 0) {
			trs.push(tr);
		}
	}
	if (!trs.length) return Number.NaN;
	const use = Math.min(length, trs.length);
	let sum = 0;
	for (let i = trs.length - use; i < trs.length; i++) {
		sum += trs[i];
	}
	return sum / use;
}

function estimateDefaultRangeSize(data) {
	const atr = estimateAtrRange(data, 14);
	if (Number.isFinite(atr) && atr > 0) {
		let multiplier = 1;
		switch (timeframe) {
			case '5m':
				multiplier = 0.8;
				break;
			case '15m':
				multiplier = 1;
				break;
			case '1h':
				multiplier = 1.2;
				break;
			case '4h':
				multiplier = 1.4;
				break;
			case '1d':
				multiplier = 1.6;
				break;
			default:
				multiplier = 1;
		}
		return atr * multiplier;
	}
	let minPrice = Number.POSITIVE_INFINITY;
	let maxPrice = Number.NEGATIVE_INFINITY;
	for (const bar of data) {
		if (typeof bar.high === 'number' && bar.high > maxPrice) {
			maxPrice = bar.high;
		}
		if (typeof bar.low === 'number' && bar.low < minPrice) {
			minPrice = bar.low;
		}
	}
	if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
		return Number.NaN;
	}
	const span = maxPrice - minPrice;
	if (!Number.isFinite(span) || span <= 0) {
		return Number.NaN;
	}
	return span / 50;
}

function buildRangeBars(data, rangeSize) {
	const len = data.length;
	if (!len) return [];
	const baseline = estimateDefaultRangeSize(data);
	let effectiveRangeSize;
	if (Number.isFinite(baseline) && baseline > 0) {
		const mult = typeof rangeSize === 'number' && rangeSize > 0 ? rangeSize : 1;
		effectiveRangeSize = baseline * mult;
	} else {
		effectiveRangeSize =
			typeof rangeSize === 'number' && rangeSize > 0 ? rangeSize : Number.NaN;
	}
	if (!Number.isFinite(effectiveRangeSize) || effectiveRangeSize <= 0) {
		return data.slice();
	}
	const out = [];
	let curOpen = Number.NaN;
	let curHigh = Number.NaN;
	let curLow = Number.NaN;
	let curClose = Number.NaN;
	let curVolume = 0;
	for (const bar of data) {
		const open = bar.open;
		const high = bar.high;
		const low = bar.low;
		const close = bar.close;
		if (
			typeof open !== 'number' ||
			typeof high !== 'number' ||
			typeof low !== 'number' ||
			typeof close !== 'number'
		) {
			continue;
		}
		const volume =
			bar.customValues && typeof bar.customValues.volume === 'number'
				? bar.customValues.volume
				: 0;
		if (!Number.isFinite(curOpen)) {
			curOpen = open;
			curHigh = high;
			curLow = low;
			curClose = close;
			curVolume = volume;
		} else {
			if (high > curHigh) curHigh = high;
			if (low < curLow) curLow = low;
			curClose = close;
			curVolume += volume;
		}
		const span = curHigh - curLow;
		if (span >= effectiveRangeSize) {
			out.push({
				time: bar.time,
				open: curOpen,
				high: curHigh,
				low: curLow,
				close: curClose,
				customValues: { volume: curVolume },
			});
			curOpen = Number.NaN;
			curHigh = Number.NaN;
			curLow = Number.NaN;
			curClose = Number.NaN;
			curVolume = 0;
		}
	}
	if (Number.isFinite(curOpen)) {
		out.push({
			time: data[data.length - 1].time,
			open: curOpen,
			high: curHigh,
			low: curLow,
			close: curClose,
			customValues: { volume: curVolume },
		});
	}
	return out.length ? out : data.slice();
}

function buildRenkoBricks(data, boxSize) {
	const len = data.length;
	if (!len) return [];
	let effectiveBoxSize =
		typeof boxSize === 'number' && boxSize > 0
			? boxSize
			: estimateDefaultRangeSize(data);
	if (!Number.isFinite(effectiveBoxSize) || effectiveBoxSize <= 0) {
		return data.slice();
	}
	const bricks = [];
	const first = data[0];
	if (
		typeof first.open !== 'number' ||
		typeof first.high !== 'number' ||
		typeof first.low !== 'number' ||
		typeof first.close !== 'number'
	) {
		return data.slice();
	}
	let baseTime = typeof first.time === 'number' ? first.time : 0;
	let brickIndex = 0;
	let lastBrickClose = first.close;
	let lastDirection = 0; // 1 up, -1 down
	let pendingVolume = 0;
	for (const bar of data) {
		const close = bar.close;
		if (typeof close !== 'number') {
			continue;
		}
		const volume =
			bar.customValues && typeof bar.customValues.volume === 'number'
				? bar.customValues.volume
				: 0;
		pendingVolume += volume;
		while (true) {
			const diff = close - lastBrickClose;
			const absDiff = Math.abs(diff);
			if (absDiff < effectiveBoxSize) {
				break;
			}
			const dir = diff > 0 ? 1 : -1;
			// Require at least 2 boxes worth of move for a true reversal
			if (lastDirection !== 0 && dir !== lastDirection && absDiff < 2 * effectiveBoxSize) {
				break;
			}
			const newClose = lastBrickClose + dir * effectiveBoxSize;
			const open = lastBrickClose;
			const high = Math.max(open, newClose);
			const low = Math.min(open, newClose);
			const brickTime = baseTime + brickIndex;
			bricks.push({
				time: brickTime,
				open,
				high,
				low,
				close: newClose,
				customValues: { volume: pendingVolume },
			});
			brickIndex++;
			lastBrickClose = newClose;
			lastDirection = dir;
			pendingVolume = 0;
		}
	}
	return bricks.length ? bricks : data.slice();
}

function buildKagiLines(data, reversalSize) {
	const len = data.length;
	if (!len) return [];
	let effectiveReversal =
		typeof reversalSize === 'number' && reversalSize > 0
			? reversalSize
			: estimateDefaultRangeSize(data);
	if (!Number.isFinite(effectiveReversal) || effectiveReversal <= 0) {
		return data.slice();
	}
	const lines = [];
	let lastPrice = data[0]?.close;
	if (typeof lastPrice !== 'number') {
		return data.slice();
	}
	let direction = 0; // 1 up, -1 down
	let extremeHigh = lastPrice;
	let extremeLow = lastPrice;
	let pendingVolume = 0;
	for (const bar of data) {
		const close = bar.close;
		if (typeof close !== 'number') {
			continue;
		}
		const volume =
			bar.customValues && typeof bar.customValues.volume === 'number'
				? bar.customValues.volume
				: 0;
		pendingVolume += volume;
		if (direction === 0) {
			const diff0 = close - lastPrice;
			if (Math.abs(diff0) >= effectiveReversal) {
				const dir0 = diff0 > 0 ? 1 : -1;
				const open0 = lastPrice;
				const high0 = Math.max(open0, close);
				const low0 = Math.min(open0, close);
				lines.push({
					time: bar.time,
					open: open0,
					high: high0,
					low: low0,
					close,
					customValues: { volume: pendingVolume },
				});
				lastPrice = close;
				direction = dir0;
				extremeHigh = close;
				extremeLow = close;
				pendingVolume = 0;
			}
			continue;
		}
		if (direction === 1) {
			if (close > extremeHigh) {
				extremeHigh = close;
			}
			const moveDown = extremeHigh - close;
			if (moveDown >= effectiveReversal) {
				const open = lastPrice;
				const high = Math.max(open, close);
				const low = Math.min(open, close);
				lines.push({
					time: bar.time,
					open,
					high,
					low,
					close,
					customValues: { volume: pendingVolume },
				});
				lastPrice = close;
				direction = -1;
				extremeLow = close;
				extremeHigh = close;
				pendingVolume = 0;
				continue;
			}
			const moveUp = close - lastPrice;
			if (moveUp >= effectiveReversal) {
				const open = lastPrice;
				const high = Math.max(open, close);
				const low = Math.min(open, close);
				lines.push({
					time: bar.time,
					open,
					high,
					low,
					close,
					customValues: { volume: pendingVolume },
				});
				lastPrice = close;
				extremeHigh = close;
				pendingVolume = 0;
			}
		} else if (direction === -1) {
			if (close < extremeLow) {
				extremeLow = close;
			}
			const moveUp = close - extremeLow;
			if (moveUp >= effectiveReversal) {
				const open = lastPrice;
				const high = Math.max(open, close);
				const low = Math.min(open, close);
				lines.push({
					time: bar.time,
					open,
					high,
					low,
					close,
					customValues: { volume: pendingVolume },
				});
				lastPrice = close;
				direction = 1;
				extremeHigh = close;
				extremeLow = close;
				pendingVolume = 0;
				continue;
			}
			const moveDown = lastPrice - close;
			if (moveDown >= effectiveReversal) {
				const open = lastPrice;
				const high = Math.max(open, close);
				const low = Math.min(open, close);
				lines.push({
					time: bar.time,
					open,
					high,
					low,
					close,
					customValues: { volume: pendingVolume },
				});
				lastPrice = close;
				extremeLow = close;
				pendingVolume = 0;
			}
		}
	}
	return lines.length ? lines : data.slice();
}

function computeDecomposition(lineData, config) {
	if (!Array.isArray(lineData) || lineData.length === 0) {
		return { trend: [], seasonal: [], residual: [] };
	}
	const defaults = {
		trendLength: 50,
		trendMethod: 'sma',
		centered: true,
		seasonLength: 168,
		seasonSmoothing: 1,
		normalizeSeasonality: true,
		residualStdWindow: 100,
		standardizeResiduals: true,
		model: 'additive',
	};
	const cfg = Object.assign({}, defaults, config || {});
	let trendLength = Math.max(2, Math.floor(cfg.trendLength || defaults.trendLength));
	let seasonLength = Math.max(2, Math.floor(cfg.seasonLength || defaults.seasonLength));
	let seasonSmoothing = Math.max(1, Math.floor(cfg.seasonSmoothing || 1));
	let residualStdWindow = Math.max(
		5,
		Math.floor(cfg.residualStdWindow || defaults.residualStdWindow)
	);
	const centered = !!cfg.centered;
	const normalizeSeasonality = !!cfg.normalizeSeasonality;
	const standardizeResiduals = !!cfg.standardizeResiduals;
	let model = cfg.model === 'multiplicative' ? 'multiplicative' : 'additive';

	const n = lineData.length;
	const times = new Array(n);
	const y = new Array(n);
	for (let i = 0; i < n; i++) {
		const p = lineData[i];
		times[i] = p && typeof p.time !== 'undefined' ? p.time : undefined;
		const v = p && typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : NaN;
		y[i] = v;
	}

	function decomposeAdditive(values) {
		const trendArr = new Array(n).fill(Number.NaN);
		const seasonalArr = new Array(n).fill(Number.NaN);
		const residualArr = new Array(n).fill(Number.NaN);

		// Trend: centered or trailing moving average
		if (trendLength > n) {
			trendLength = n;
		}
		if (trendLength >= 2) {
			if (centered) {
				const half = Math.floor(trendLength / 2);
				const effLen = half * 2 + 1;
				for (let i = half; i < n - half; i++) {
					let sum = 0;
					let count = 0;
					for (let j = i - half; j <= i + half; j++) {
						const v = values[j];
						if (typeof v === 'number' && Number.isFinite(v)) {
							sum += v;
							count++;
						}
					}
					if (count === effLen) {
						trendArr[i] = sum / effLen;
					}
				}
			} else {
				// trailing simple moving average
				for (let i = trendLength - 1; i < n; i++) {
					let sum = 0;
					let count = 0;
					for (let j = i - trendLength + 1; j <= i; j++) {
						const v = values[j];
						if (typeof v === 'number' && Number.isFinite(v)) {
							sum += v;
							count++;
						}
					}
					if (count === trendLength) {
						trendArr[i] = sum / trendLength;
					}
				}
			}
		}

		// Detrended series
		const detrended = new Array(n).fill(Number.NaN);
		for (let i = 0; i < n; i++) {
			const yy = values[i];
			const tt = trendArr[i];
			if (
				typeof yy === 'number' &&
				Number.isFinite(yy) &&
				typeof tt === 'number' &&
				Number.isFinite(tt)
			) {
				detrended[i] = yy - tt;
			}
		}

		// Seasonal indices S_k
		seasonLength = Math.max(2, Math.min(seasonLength, n));
		const seasonSums = new Array(seasonLength).fill(0);
		const seasonCounts = new Array(seasonLength).fill(0);
		for (let i = 0; i < n; i++) {
			const v = detrended[i];
			if (typeof v === 'number' && Number.isFinite(v)) {
				const k = i % seasonLength;
				seasonSums[k] += v;
				seasonCounts[k]++;
			}
		}
		const seasonBase = new Array(seasonLength).fill(0);
		for (let k = 0; k < seasonLength; k++) {
			if (seasonCounts[k] > 0) {
				seasonBase[k] = seasonSums[k] / seasonCounts[k];
			}
		}

		// Optional smoothing over S_k
		let seasonSmooth = seasonBase.slice();
		if (seasonSmoothing > 1) {
			const win = seasonSmoothing;
			const halfWin = Math.floor(win / 2);
			const tmp = new Array(seasonLength).fill(0);
			for (let k = 0; k < seasonLength; k++) {
				let sum = 0;
				let count = 0;
				for (let j = -halfWin; j <= halfWin; j++) {
					let idx = k + j;
					if (idx < 0) idx += seasonLength;
					if (idx >= seasonLength) idx -= seasonLength;
					const v = seasonBase[idx];
					if (typeof v === 'number' && Number.isFinite(v)) {
						sum += v;
						count++;
					}
				}
				tmp[k] = count > 0 ? sum / count : 0;
			}
			seasonSmooth = tmp;
		}

		// Normalize seasonality to mean 0 over a cycle
		if (normalizeSeasonality) {
			let sum = 0;
			for (let k = 0; k < seasonLength; k++) {
				sum += seasonSmooth[k];
			}
			const mean = seasonLength > 0 ? sum / seasonLength : 0;
			for (let k = 0; k < seasonLength; k++) {
				seasonSmooth[k] -= mean;
			}
		}

		// Build S(t)
		for (let i = 0; i < n; i++) {
			const tt = trendArr[i];
			const yy = values[i];
			if (
				typeof yy === 'number' &&
				Number.isFinite(yy) &&
				typeof tt === 'number' &&
				Number.isFinite(tt)
			) {
				const k = i % seasonLength;
				seasonalArr[i] = seasonSmooth[k];
			}
		}

		// Residual R(t) = Y - T - S
		for (let i = 0; i < n; i++) {
			const yy = values[i];
			const tt = trendArr[i];
			const ss = seasonalArr[i];
			if (
				typeof yy === 'number' &&
				Number.isFinite(yy) &&
				typeof tt === 'number' &&
				Number.isFinite(tt) &&
				typeof ss === 'number' &&
				Number.isFinite(ss)
			) {
				residualArr[i] = yy - tt - ss;
			}
		}

		// Optional residual standardization (z-scores)
		if (standardizeResiduals) {
			const win = residualStdWindow;
			let sum = 0;
			let sumSq = 0;
			const queue = [];
			for (let i = 0; i < n; i++) {
				const r = residualArr[i];
				if (typeof r === 'number' && Number.isFinite(r)) {
					queue.push({ index: i, value: r });
					sum += r;
					sumSq += r * r;
				}
				while (queue.length && queue[0].index < i - win + 1) {
					const item = queue.shift();
					sum -= item.value;
					sumSq -= item.value * item.value;
				}
				if (queue.length >= 5) {
					const m = sum / queue.length;
					const varVal = Math.max(0, sumSq / queue.length - m * m);
					const std = Math.sqrt(varVal);
					if (std > 0) {
						const r = residualArr[i];
						residualArr[i] = (r - m) / std;
					}
				}
			}
		}

		return { trendArr, seasonalArr, residualArr };
	}

	let valuesForDecomp = y.slice();
	let usedModel = model;
	let logValues = null;
	if (model === 'multiplicative') {
		logValues = new Array(n);
		let ok = true;
		for (let i = 0; i < n; i++) {
			const v = y[i];
			if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
				logValues[i] = Math.log(v);
			} else if (Number.isNaN(v)) {
				logValues[i] = Number.NaN;
			} else {
				ok = false;
				break;
			}
		}
		if (ok) {
			valuesForDecomp = logValues;
		} else {
			usedModel = 'additive';
		}
	}

	const { trendArr, seasonalArr, residualArr } = decomposeAdditive(valuesForDecomp);

	const trend = new Array(n);
	const seasonal = new Array(n);
	const residual = new Array(n);
	for (let i = 0; i < n; i++) {
		const time = times[i];
		let tVal = trendArr[i];
		let sVal = seasonalArr[i];
		let rVal = residualArr[i];
		if (usedModel === 'multiplicative') {
			if (typeof tVal === 'number' && Number.isFinite(tVal)) {
				tVal = Math.exp(tVal);
			} else {
				tVal = null;
			}
			if (typeof sVal === 'number' && Number.isFinite(sVal)) {
				sVal = Math.exp(sVal);
			} else {
				sVal = null;
			}
			if (typeof rVal === 'number' && Number.isFinite(rVal)) {
				rVal = Math.exp(rVal);
			} else {
				rVal = null;
			}
		} else {
			if (!(typeof tVal === 'number' && Number.isFinite(tVal))) tVal = null;
			if (!(typeof sVal === 'number' && Number.isFinite(sVal))) sVal = null;
			if (!(typeof rVal === 'number' && Number.isFinite(rVal))) rVal = null;
		}
		trend[i] = { time, value: tVal };
		seasonal[i] = { time, value: sVal };
		residual[i] = { time, value: rVal };
	}
	return { trend, seasonal, residual };
}

function getDefaultTsdSeasonLength(tf) {
	switch (tf) {
		case '5m':
			return 2016; // 7 days of 288 bars
		case '15m':
			return 672; // 7 days of 96 bars
		case '1h':
			return 168; // 7 days of 24 bars
		case '4h':
			return 42; // 7 days of 6 bars
		case '1d':
			return 7; // 7 days of 1 bar
		default:
			return 168;
	}
}

function computeEMA(values, length) {
	if (!values.length) return [];
	const k = 2 / (length + 1);
	let ema = values[0].value;
	const out = [{ time: values[0].time, value: ema }];
	for (let i = 1; i < values.length; i++) {
		ema = values[i].value * k + ema * (1 - k);
		out.push({ time: values[i].time, value: ema });
	}
	return out;
}

function computeVWAP(candles) {
	if (!candles.length) return [];
	let cumPV = 0;
	let cumV = 0;
	const out = [];
	for (const bar of candles) {
		const v =
			bar.customValues && typeof bar.customValues.volume === 'number'
				? bar.customValues.volume
				: 0;
		const tp = (bar.high + bar.low + bar.close) / 3;
		cumPV += tp * v;
		cumV += v;
		let value = tp;
		if (Number.isFinite(cumV) && cumV > 0) {
			value = cumPV / cumV;
		}
		out.push({ time: bar.time, value });
	}
	return out;
}

function computeATR(candles, length) {
	if (candles.length < length + 1) return [];
	const trs = [];
	for (let i = 1; i < candles.length; i++) {
		const prev = candles[i - 1];
		const cur = candles[i];
		const highLow = cur.high - cur.low;
		const highClose = Math.abs(cur.high - prev.close);
		const lowClose = Math.abs(cur.low - prev.close);
		const tr = Math.max(highLow, highClose, lowClose);
		trs.push({ time: cur.time, tr, close: cur.close });
	}
	if (trs.length < length) return [];
	let sumTr = 0;
	for (let i = 0; i < length; i++) {
		sumTr += trs[i].tr;
	}
	let atr = sumTr / length;
	const out = [];
	// first ATR point corresponds to trs[length - 1]
	let base = trs[length - 1];
	let pct = base.close > 0 ? (atr / base.close) * 100 : 0;
	out.push({ time: base.time, value: pct });
	for (let i = length; i < trs.length; i++) {
		const cur = trs[i];
		atr = ((atr * (length - 1)) + cur.tr) / length;
		pct = cur.close > 0 ? (atr / cur.close) * 100 : 0;
		out.push({ time: cur.time, value: pct });
	}
	return out;
}

function computeADX(candles, length) {
	if (candles.length < length + 1) return { adx: [], diPlus: [], diMinus: [] };
	const trs = [];
	const posDM = [];
	const negDM = [];
	for (let i = 1; i < candles.length; i++) {
		const prev = candles[i - 1];
		const cur = candles[i];
		const upMove = cur.high - prev.high;
		const downMove = prev.low - cur.low;
		const plusDM = upMove > 0 && upMove > downMove ? upMove : 0;
		const minusDM = downMove > 0 && downMove > upMove ? downMove : 0;
		const tr = Math.max(
			cur.high - cur.low,
			Math.abs(cur.high - prev.close),
			Math.abs(cur.low - prev.close)
		);
		trs.push(tr);
		posDM.push(plusDM);
		negDM.push(minusDM);
	}
	if (trs.length < length) return { adx: [], diPlus: [], diMinus: [] };
	let sumTR = 0;
	let sumPosDM = 0;
	let sumNegDM = 0;
	for (let i = 0; i < length; i++) {
		sumTR += trs[i];
		sumPosDM += posDM[i];
		sumNegDM += negDM[i];
	}
	let atr = sumTR / length;
	let smPosDM = sumPosDM;
	let smNegDM = sumNegDM;
	const diPlusArr = [];
	const diMinusArr = [];
	const dxArr = [];
	// first index where DI/ADX are defined corresponds to candles[length]
	for (let i = length; i < trs.length; i++) {
		if (i > length) {
			atr = ((atr * (length - 1)) + trs[i]) / length;
			smPosDM = ((smPosDM * (length - 1)) + posDM[i]) / length;
			smNegDM = ((smNegDM * (length - 1)) + negDM[i]) / length;
		}
		let diPlus = 0;
		let diMinus = 0;
		if (atr > 0) {
			diPlus = (smPosDM / atr) * 100;
			diMinus = (smNegDM / atr) * 100;
		}
		const sumDI = diPlus + diMinus;
		let dx = 0;
		if (sumDI > 0) {
			dx = (Math.abs(diPlus - diMinus) / sumDI) * 100;
		}
		diPlusArr.push({ time: candles[i + 1].time, value: diPlus });
		diMinusArr.push({ time: candles[i + 1].time, value: diMinus });
		dxArr.push(dx);
	}
	if (dxArr.length < length) {
		return { adx: [], diPlus: [], diMinus: [] };
	}
	let sumDX = 0;
	for (let i = 0; i < length; i++) {
		sumDX += dxArr[i];
	}
	let adxPrev = sumDX / length;
	const adxArr = [];
	// align ADX with the last part of diPlusArr
	for (let i = length; i < dxArr.length; i++) {
		adxPrev = ((adxPrev * (length - 1)) + dxArr[i]) / length;
		const time = diPlusArr[i].time;
		adxArr.push({ time, value: adxPrev });
	}
	return { adx: adxArr, diPlus: diPlusArr, diMinus: diMinusArr };
}

function computeIchimoku(candles, params) {
	const { conversionPeriod, basePeriod, spanBPeriod, displacement } = params;
	const len = candles.length;
	if (len === 0) {
		return { tenkan: [], kijun: [], spanA: [], spanB: [], chikou: [] };
	}
	const tenkanVals = new Array(len).fill(null);
	const kijunVals = new Array(len).fill(null);
	const spanBVals = new Array(len).fill(null);
	const tenkan = [];
	const kijun = [];
	const spanA = [];
	const spanB = [];
	const chikou = [];

	for (let i = conversionPeriod - 1; i < len; i++) {
		let highestHigh = Number.NEGATIVE_INFINITY;
		let lowestLow = Number.POSITIVE_INFINITY;
		for (let j = i - conversionPeriod + 1; j <= i; j++) {
			const bar = candles[j];
			if (bar.high > highestHigh) highestHigh = bar.high;
			if (bar.low < lowestLow) lowestLow = bar.low;
		}
		const value = (highestHigh + lowestLow) / 2;
		tenkanVals[i] = value;
		tenkan.push({ time: candles[i].time, value });
	}

	for (let i = basePeriod - 1; i < len; i++) {
		let highestHigh = Number.NEGATIVE_INFINITY;
		let lowestLow = Number.POSITIVE_INFINITY;
		for (let j = i - basePeriod + 1; j <= i; j++) {
			const bar = candles[j];
			if (bar.high > highestHigh) highestHigh = bar.high;
			if (bar.low < lowestLow) lowestLow = bar.low;
		}
		const value = (highestHigh + lowestLow) / 2;
		kijunVals[i] = value;
		kijun.push({ time: candles[i].time, value });
	}

	for (let i = spanBPeriod - 1; i < len; i++) {
		let highestHigh = Number.NEGATIVE_INFINITY;
		let lowestLow = Number.POSITIVE_INFINITY;
		for (let j = i - spanBPeriod + 1; j <= i; j++) {
			const bar = candles[j];
			if (bar.high > highestHigh) highestHigh = bar.high;
			if (bar.low < lowestLow) lowestLow = bar.low;
		}
		const value = (highestHigh + lowestLow) / 2;
		spanBVals[i] = value;
	}

	for (let i = 0; i < len; i++) {
		const tp = candles[i].close;
		const shiftedIndex = i - displacement;
		if (shiftedIndex >= 0) {
			chikou.push({ time: candles[shiftedIndex].time, value: tp });
		}
	}

	for (let i = 0; i < len; i++) {
		const targetIndex = i + displacement;
		if (targetIndex >= len) continue;
		const ten = tenkanVals[i];
		const kij = kijunVals[i];
		if (ten != null && kij != null) {
			spanA.push({
				time: candles[targetIndex].time,
				value: (ten + kij) / 2,
			});
		}
		const b = spanBVals[i];
		if (b != null) {
			spanB.push({ time: candles[targetIndex].time, value: b });
		}
	}

	return { tenkan, kijun, spanA, spanB, chikou };
}

function computeMomentum(values, length) {
	if (values.length < length + 1) return [];
	const out = [];
	for (let i = length; i < values.length; i++) {
		const prev = values[i - length];
		const cur = values[i];
		const value = cur.value - prev.value;
		out.push({ time: cur.time, value });
	}
	return out;
}

function computeBIAS(values, length) {
	if (values.length < length) return [];
	const ma = computeSMA(values, length);
	const out = [];
	for (let i = 0; i < ma.length; i++) {
		const maPoint = ma[i];
		const srcIndex = i + length - 1;
		const src = values[srcIndex];
		if (!maPoint || !src || maPoint.value === 0) continue;
		const value = ((src.value - maPoint.value) / maPoint.value) * 100;
		out.push({ time: src.time, value });
	}
	return out;
}

function computeROC(values, length) {
	if (values.length < length + 1) return [];
	const out = [];
	for (let i = length; i < values.length; i++) {
		const prev = values[i - length];
		const cur = values[i];
		let value = 0;
		if (prev.value !== 0) {
			value = ((cur.value / prev.value) - 1) * 100;
		}
		out.push({ time: cur.time, value });
	}
	return out;
}

function computeVR(candles, length) {
	if (candles.length < length + 1) return [];
	const up = new Array(candles.length).fill(0);
	const down = new Array(candles.length).fill(0);
	const same = new Array(candles.length).fill(0);
	for (let i = 1; i < candles.length; i++) {
		const prev = candles[i - 1];
		const cur = candles[i];
		const prevClose = typeof prev.close === 'number' ? prev.close : 0;
		const curClose = typeof cur.close === 'number' ? cur.close : prevClose;
		const volume =
			cur.customValues && typeof cur.customValues.volume === 'number'
				? cur.customValues.volume
				: 0;
		if (curClose > prevClose) {
			up[i] = volume;
		} else if (curClose < prevClose) {
			down[i] = volume;
		} else {
			same[i] = volume;
		}
	}
	const out = [];
	for (let i = length; i < candles.length; i++) {
		let upSum = 0;
		let downSum = 0;
		let sameSum = 0;
		for (let j = i - length + 1; j <= i; j++) {
			upSum += up[j];
			downSum += down[j];
			sameSum += same[j];
		}
		const upAdj = upSum + sameSum * 0.5;
		const downAdj = downSum + sameSum * 0.5;
		let vr = 100;
		if (downAdj > 0) {
			vr = (upAdj / downAdj) * 100;
		}
		out.push({ time: candles[i].time, value: vr });
	}
	return out;
}

function computeDMA(values, fastLength, slowLength) {
	if (values.length === 0) return [];
	const fast = computeSMA(values, fastLength);
	const slow = computeSMA(values, slowLength);
	if (!fast.length || !slow.length) return [];
	const slowByTime = new Map(slow.map(p => [p.time, p.value]));
	const out = [];
	for (const f of fast) {
		const sv = slowByTime.get(f.time);
		if (typeof sv === 'number' && Number.isFinite(sv)) {
			out.push({ time: f.time, value: f.value - sv });
		}
	}
	return out;
}

function computeTRIX(values, length, signalLength) {
	if (!values.length) return { trix: [], signal: [] };
	const ema1 = computeEMA(values, length);
	const ema2 = computeEMA(ema1, length);
	const ema3 = computeEMA(ema2, length);
	if (ema3.length < 2) return { trix: [], signal: [] };
	const trixPoints = [];
	for (let i = 1; i < ema3.length; i++) {
		const prev = ema3[i - 1].value;
		const cur = ema3[i].value;
		let v = 0;
		if (prev !== 0) {
			v = ((cur / prev) - 1) * 100;
		}
		trixPoints.push({ time: ema3[i].time, value: v });
	}
	const signal = signalLength > 1 ? computeEMA(trixPoints, signalLength) : [];
	return { trix: trixPoints, signal };
}

function computeWilliamsR(candles, length) {
	if (candles.length < length) return [];
	const out = [];
	for (let i = length - 1; i < candles.length; i++) {
		let highestHigh = Number.NEGATIVE_INFINITY;
		let lowestLow = Number.POSITIVE_INFINITY;
		for (let j = i - length + 1; j <= i; j++) {
			const bar = candles[j];
			if (bar.high > highestHigh) highestHigh = bar.high;
			if (bar.low < lowestLow) lowestLow = bar.low;
		}
		const close = candles[i].close;
		let value = -50;
		if (
			Number.isFinite(highestHigh) &&
			Number.isFinite(lowestLow) &&
			highestHigh !== lowestLow
		) {
			value = -100 * ((highestHigh - close) / (highestHigh - lowestLow));
		}
		out.push({ time: candles[i].time, value });
	}
	return out;
}

function computeCCI(candles, length) {
	if (candles.length < length) return [];
	const out = [];
	for (let i = length - 1; i < candles.length; i++) {
		let sumTp = 0;
		for (let j = i - length + 1; j <= i; j++) {
			const bar = candles[j];
			const tp = (bar.high + bar.low + bar.close) / 3;
			sumTp += tp;
		}
		const meanTp = sumTp / length;
		let devSum = 0;
		for (let j = i - length + 1; j <= i; j++) {
			const bar = candles[j];
			const tp = (bar.high + bar.low + bar.close) / 3;
			devSum += Math.abs(tp - meanTp);
		}
		const meanDev = devSum / length;
		const curBar = candles[i];
		const curTp = (curBar.high + curBar.low + curBar.close) / 3;
		let cci = 0;
		if (Number.isFinite(meanDev) && meanDev > 0) {
			cci = (curTp - meanTp) / (0.015 * meanDev);
		}
		out.push({ time: curBar.time, value: cci });
	}
	return out;
}

function computeStochastic(candles, length, smoothing) {
	if (candles.length < length) return { k: [], d: [] };
	const k = [];
	for (let i = length - 1; i < candles.length; i++) {
		let highestHigh = Number.NEGATIVE_INFINITY;
		let lowestLow = Number.POSITIVE_INFINITY;
		for (let j = i - length + 1; j <= i; j++) {
			const bar = candles[j];
			if (bar.high > highestHigh) highestHigh = bar.high;
			if (bar.low < lowestLow) lowestLow = bar.low;
		}
		const close = candles[i].close;
		let value = 50;
		if (
			Number.isFinite(highestHigh) &&
			Number.isFinite(lowestLow) &&
			highestHigh !== lowestLow
		) {
			value = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
		}
		k.push({ time: candles[i].time, value });
	}
	const d = computeSMA(k, smoothing);
	return { k, d };
}

function computeSMA(values, length) {
	if (values.length < length) return [];
	const out = [];
	let sum = 0;
	for (let i = 0; i < values.length; i++) {
		sum += values[i].value;
		if (i >= length) {
			sum -= values[i - length].value;
		}
		if (i >= length - 1) {
			out.push({ time: values[i].time, value: sum / length });
		}
	}
	return out;
}

function computeBB(values, length, mult) {
	if (values.length < length) return { upper: [], lower: [], basis: [] };
	const basis = computeSMA(values, length);
	const upper = [];
	const lower = [];
	for (let i = length - 1; i < values.length; i++) {
		const window = values.slice(i - length + 1, i + 1);
		const mean = basis[i - length + 1].value;
		const variance = window.reduce((acc, v) => acc + Math.pow(v.value - mean, 2), 0) / length;
		const std = Math.sqrt(variance);
		upper.push({ time: values[i].time, value: mean + mult * std });
		lower.push({ time: values[i].time, value: mean - mult * std });
	}
	return { upper, lower, basis };
}

function computeDonchian(candles, length) {
	if (candles.length < length) return { upper: [], lower: [], mid: [] };
	const upper = [];
	const lower = [];
	const mid = [];
	for (let i = length - 1; i < candles.length; i++) {
		let highestHigh = Number.NEGATIVE_INFINITY;
		let lowestLow = Number.POSITIVE_INFINITY;
		for (let j = i - length + 1; j <= i; j++) {
			const bar = candles[j];
			if (bar.high > highestHigh) highestHigh = bar.high;
			if (bar.low < lowestLow) lowestLow = bar.low;
		}
		const midVal = (highestHigh + lowestLow) / 2;
		const time = candles[i].time;
		upper.push({ time, value: highestHigh });
		lower.push({ time, value: lowestLow });
		mid.push({ time, value: midVal });
	}
	return { upper, lower, mid };
}

function computeKeltner(candles, lineValues, maLength, atrLength, mult) {
	if (!candles.length || !lineValues.length) {
		return { upper: [], lower: [], basis: [] };
	}
	// Basis: EMA of close
	const basis = computeEMA(lineValues, maLength);
	// True range series
	const trs = [];
	for (let i = 1; i < candles.length; i++) {
		const prev = candles[i - 1];
		const cur = candles[i];
		const highLow = cur.high - cur.low;
		const highClose = Math.abs(cur.high - prev.close);
		const lowClose = Math.abs(cur.low - prev.close);
		const tr = Math.max(highLow, highClose, lowClose);
		trs.push(tr);
	}
	if (trs.length < atrLength) {
		return { upper: [], lower: [], basis: [] };
	}
	let sumTr = 0;
	for (let i = 0; i < atrLength; i++) {
		sumTr += trs[i];
	}
	let atr = sumTr / atrLength;
	const atrPoints = [];
	// First ATR corresponds to candles[atrLength]
	atrPoints.push({ time: candles[atrLength].time, value: atr });
	for (let i = atrLength; i < trs.length; i++) {
		atr = ((atr * (atrLength - 1)) + trs[i]) / atrLength;
		const time = candles[i + 1].time;
		atrPoints.push({ time, value: atr });
	}
	// Map ATR to basis timeline
	const byTimeAtr = new Map(atrPoints.map(p => [p.time, p.value]));
	const upper = [];
	const lower = [];
	for (const b of basis) {
		const a = byTimeAtr.get(b.time);
		if (typeof a === 'number' && Number.isFinite(a)) {
			upper.push({ time: b.time, value: b.value + mult * a });
			lower.push({ time: b.time, value: b.value - mult * a });
		}
	}
	return { upper, lower, basis };
}

function computeParabolicSAR(candles, step = 0.02, maxStep = 0.2) {
	if (candles.length < 2) return [];
	const out = [];
	let isLong = candles[1].close >= candles[0].close;
	let af = step;
	let ep = isLong ? candles[1].high : candles[1].low;
	let sar = isLong ? candles[0].low : candles[0].high;
	for (let i = 1; i < candles.length; i++) {
		const prevSar = sar;
		sar = sar + af * (ep - sar);
		// Ensure SAR does not penetrate last 2 highs/lows
		let highLimit = candles[i - 1].high;
		let lowLimit = candles[i - 1].low;
		if (i > 1) {
			highLimit = Math.max(highLimit, candles[i - 2].high);
			lowLimit = Math.min(lowLimit, candles[i - 2].low);
		}
		if (isLong) {
			if (sar > lowLimit) sar = lowLimit;
		} else {
			if (sar < highLimit) sar = highLimit;
		}
		const bar = candles[i];
		if (isLong) {
			if (bar.low < sar) {
				isLong = false;
				sar = ep;
				ep = bar.low;
				af = step;
			} else if (bar.high > ep) {
				ep = bar.high;
				af = Math.min(af + step, maxStep);
			}
		} else {
			if (bar.high > sar) {
				isLong = true;
				sar = ep;
				ep = bar.high;
				af = step;
			} else if (bar.low < ep) {
				ep = bar.low;
				af = Math.min(af + step, maxStep);
			}
		}
		out.push({ time: bar.time, value: sar });
	}
	return out;
}

function computeRSI(values, length) {
	if (values.length < length + 1) return [];
	const out = [];
	let gains = 0;
	let losses = 0;
	for (let i = 1; i <= length; i++) {
		const change = values[i].value - values[i - 1].value;
		if (change >= 0) gains += change;
		else losses -= change;
	}
	let avgGain = gains / length;
	let avgLoss = losses / length;
	let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
	let rsi = 100 - 100 / (1 + rs);
	out.push({ time: values[length].time, value: rsi });
	for (let i = length + 1; i < values.length; i++) {
		const change = values[i].value - values[i - 1].value;
		const gain = Math.max(change, 0);
		const loss = Math.max(-change, 0);
		avgGain = (avgGain * (length - 1) + gain) / length;
		avgLoss = (avgLoss * (length - 1) + loss) / length;
		rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
		rsi = 100 - 100 / (1 + rs);
		out.push({ time: values[i].time, value: rsi });
	}
	return out;
}

function computeMACD(values, params) {
	const { fast, slow, signal } = params;
	if (values.length < slow + signal) return { macd: [], signal: [], hist: [] };
	const emaFast = computeEMA(values, fast);
	const emaSlow = computeEMA(values, slow);
	const macdLine = [];
	for (let i = 0; i < values.length; i++) {
		if (emaFast[i] && emaSlow[i]) {
			macdLine.push({
				time: values[i].time,
				value: emaFast[i].value - emaSlow[i].value,
			});
		}
	}
	const macdSignal = computeEMA(macdLine, signal);
	const hist = macdSignal.map((s, idx) => {
		const srcIndex = idx + (macdLine.length - macdSignal.length);
		const diff = (macdLine[srcIndex]?.value ?? 0) - s.value;
		return {
			time: s.time,
			value: diff,
			color: diff >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)',
		};
	});
	return { macd: macdLine.slice(-hist.length), signal: macdSignal, hist };
}

function computeVolume(values) {
	return values.map(bar => {
		const v =
			bar.customValues && typeof bar.customValues.volume === 'number'
				? bar.customValues.volume
				: 0;
		const isUp = bar.close >= bar.open;
		return {
			time: bar.time,
			value: v,
			color: isUp ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
		};
	});
}

if (container) {
	container.addEventListener('dblclick', event => {
		openIndicatorPopupForSeries(
			lastIndicatorSeriesName,
			lastIndicatorSeriesType,
			event
		);
	});
}

document.addEventListener(
	'dblclick',
	event => {
		if (!container) return;
		const target = event.target;
		if (target instanceof Node && container.contains(target)) {
			openIndicatorPopupForSeries(
				lastIndicatorSeriesName,
				lastIndicatorSeriesType,
				event
			);
		}
	},
	true
);

function computeOBV(candles) {
	if (candles.length < 2) return [];
	let obv = 0;
	const out = [];
	for (let i = 1; i < candles.length; i++) {
		const prev = candles[i - 1];
		const cur = candles[i];
		const volume =
			cur.customValues && typeof cur.customValues.volume === 'number'
				? cur.customValues.volume
				: 0;
		if (cur.close > prev.close) {
			obv += volume;
		} else if (cur.close < prev.close) {
			obv -= volume;
		}
		out.push({ time: cur.time, value: obv });
	}
	return out;
}
function build3DSeriesData(base, yArray, zArray) {
	const out = [];
	if (!Array.isArray(base) || !Array.isArray(yArray) || !Array.isArray(zArray)) {
		return out;
	}
	const len = Math.min(base.length, yArray.length, zArray.length);
	for (let i = 0; i < len; i++) {
		const yVal = yArray[i];
		const zVal = zArray[i];
		const y =
			typeof yVal === 'number'
				? yVal
				: yVal && typeof yVal.value === 'number'
					? yVal.value
					: Number.NaN;
		const z =
			typeof zVal === 'number'
				? zVal
				: zVal && typeof zVal.value === 'number'
					? zVal.value
					: Number.NaN;
		if (!Number.isFinite(y) || !Number.isFinite(z)) continue;
		// Use index as X so 3D stays aligned with the current visible range
		out.push([i, y, z]);
	}
	return out;
}

function readPositiveNumber(input, fallback) {
	const raw =
		input && typeof input.value === 'string'
			? Number.parseFloat(input.value)
			: Number.NaN;
	const value = Math.round(raw);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function read3DMainZSource() {
	const el = setting3dMainZSource;
	if (!el || typeof el.value !== 'string') {
		return 'rsi.14';
	}
	return el.value || 'rsi.14';
}

function readNonNegativeNumber(input, fallback) {
	const raw =
		input && typeof input.value === 'string'
			? Number.parseFloat(input.value)
			: Number.NaN;
	return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function getIndicatorSettings() {
	return {
		emaLength: readPositiveNumber(settingEmaLengthInput, 50),
		emaFastLength: readPositiveNumber(settingEmaFastLengthInput, 20),
		emaSlowLength: readPositiveNumber(settingEmaSlowLengthInput, 100),
		smaLength: readPositiveNumber(settingSmaLengthInput, 20),
		bbLength: readPositiveNumber(settingBbLengthInput, 20),
		bbMult: readNonNegativeNumber(settingBbMultInput, 2),
		donchianLength: readPositiveNumber(settingDonchianLengthInput, 20),
		rsiLength: readPositiveNumber(settingRsiLengthInput, 14),
		stochLength: readPositiveNumber(settingStochLengthInput, 14),
		stochSmoothing: readPositiveNumber(settingStochSmoothingInput, 3),
		cciLength: readPositiveNumber(settingCciLengthInput, 20),
		wprLength: readPositiveNumber(settingWprLengthInput, 14),
		momentumLength: readPositiveNumber(settingMomLengthInput, 10),
		rocLength: readPositiveNumber(settingRocLengthInput, 10),
		vrLength: readPositiveNumber(settingVrLengthInput, 26),
		atrLength: readPositiveNumber(settingAtrLengthInput, 14),
		adxLength: readPositiveNumber(settingAdxLengthInput, 14),
		macdFast: readPositiveNumber(settingMacdFastInput, 12),
		macdSlow: readPositiveNumber(settingMacdSlowInput, 26),
		macdSignal: readPositiveNumber(settingMacdSignalInput, 9),
		keltnerMaLength: readPositiveNumber(settingKeltnerMaLengthInput, 20),
		keltnerAtrLength: readPositiveNumber(settingKeltnerAtrLengthInput, 20),
		keltnerMult: readNonNegativeNumber(settingKeltnerMultInput, 1.5),
		rangeSize: readNonNegativeNumber(settingRangeSizeInput, 0),
		renkoBoxSize: readNonNegativeNumber(settingRenkoBoxSizeInput, 0),
		kagiReversalSize: readNonNegativeNumber(settingKagiReversalSizeInput, 0),
		ichConv: readPositiveNumber(settingIchConvInput, 9),
		ichBase: readPositiveNumber(settingIchBaseInput, 26),
		ichSpanB: readPositiveNumber(settingIchSpanBInput, 52),
		ichDisplacement: readPositiveNumber(settingIchDisplacementInput, 26),
		biasLength: readPositiveNumber(settingBiasLengthInput, 20),
		dmaFastLength: readPositiveNumber(settingDmaFastLengthInput, 10),
		dmaSlowLength: readPositiveNumber(settingDmaSlowLengthInput, 50),
		trixLength: readPositiveNumber(settingTrixLengthInput, 18),
		trixSignal: readPositiveNumber(settingTrixSignalInput, 9),
		psarStep: readNonNegativeNumber(settingPsarStepInput, 0.02),
		psarMaxStep: readNonNegativeNumber(settingPsarMaxStepInput, 0.2),
		tsdTrendLength: readPositiveNumber(settingTsdTrendLengthInput, 50),
		tsdSeasonLength: readPositiveNumber(
			settingTsdSeasonLengthInput,
			getDefaultTsdSeasonLength(timeframe)
		),
		tsdSeasonSmoothing: readPositiveNumber(settingTsdSeasonSmoothingInput, 1),
		tsdResidualStdWindow: readPositiveNumber(
			settingTsdResidualStdWindowInput,
			100
		),
		tsdNormalizeSeasonality:
			settingTsdNormalizeInput && typeof settingTsdNormalizeInput.checked === 'boolean'
				? !!settingTsdNormalizeInput.checked
				: true,
		tsdStandardizeResiduals:
			settingTsdStandardizeInput &&
			typeof settingTsdStandardizeInput.checked === 'boolean'
				? !!settingTsdStandardizeInput.checked
				: true,
		tsdModel:
			settingTsdModelSelect && typeof settingTsdModelSelect.value === 'string'
				? settingTsdModelSelect.value || 'additive'
				: 'additive',
	};
}

const indicatorPopupConfigsBySeries = {
	'EMA 50': {
		title: 'EMA 50',
		fields: [{ label: 'Length', input: settingEmaLengthInput }],
	},
	'EMA 20': {
		title: 'EMA 20',
		fields: [{ label: 'Length', input: settingEmaFastLengthInput }],
	},
	'EMA 100': {
		title: 'EMA 100',
		fields: [{ label: 'Length', input: settingEmaSlowLengthInput }],
	},
	'SMA 20': {
		title: 'SMA 20',
		fields: [{ label: 'Length', input: settingSmaLengthInput }],
	},
	'BB Upper': {
		title: 'Bollinger Bands',
		fields: [
			{ label: 'Length', input: settingBbLengthInput },
			{ label: 'StdDev Mult', input: settingBbMultInput },
		],
	},
	'BB Lower': {
		title: 'Bollinger Bands',
		fields: [
			{ label: 'Length', input: settingBbLengthInput },
			{ label: 'StdDev Mult', input: settingBbMultInput },
		],
	},
	'BB Basis': {
		title: 'Bollinger Bands',
		fields: [
			{ label: 'Length', input: settingBbLengthInput },
			{ label: 'StdDev Mult', input: settingBbMultInput },
		],
	},
	'Donchian Upper': {
		title: 'Donchian Channel',
		fields: [{ label: 'Length', input: settingDonchianLengthInput }],
	},
	'Donchian Lower': {
		title: 'Donchian Channel',
		fields: [{ label: 'Length', input: settingDonchianLengthInput }],
	},
	'Donchian Mid': {
		title: 'Donchian Channel',
		fields: [{ label: 'Length', input: settingDonchianLengthInput }],
	},
	'RSI': {
		title: 'RSI',
		fields: [{ label: 'Length', input: settingRsiLengthInput }],
	},
	'Stoch %K': {
		title: 'Stochastic',
		fields: [
			{ label: 'Length', input: settingStochLengthInput },
			{ label: 'Smoothing', input: settingStochSmoothingInput },
		],
	},
	'Stoch %D': {
		title: 'Stochastic',
		fields: [
			{ label: 'Length', input: settingStochLengthInput },
			{ label: 'Smoothing', input: settingStochSmoothingInput },
		],
	},
	'KDJ J': {
		title: 'KDJ',
		fields: [
			{ label: 'Length', input: settingStochLengthInput },
			{ label: 'Smoothing', input: settingStochSmoothingInput },
		],
	},
	'CCI 20': {
		title: 'CCI 20',
		fields: [{ label: 'Length', input: settingCciLengthInput }],
	},
	'Momentum 10': {
		title: 'Momentum 10',
		fields: [{ label: 'Length', input: settingMomLengthInput }],
	},
	'ROC 10': {
		title: 'ROC 10',
		fields: [{ label: 'Length', input: settingRocLengthInput }],
	},
	'DMA (10, 50)': {
		title: 'DMA',
		fields: [
			{ label: 'Fast length', input: settingDmaFastLengthInput },
			{ label: 'Slow length', input: settingDmaSlowLengthInput },
		],
	},
	'TRIX (18, 9)': {
		title: 'TRIX',
		fields: [
			{ label: 'Length', input: settingTrixLengthInput },
			{ label: 'Signal length', input: settingTrixSignalInput },
		],
	},
	'TRIX Signal': {
		title: 'TRIX',
		fields: [
			{ label: 'Length', input: settingTrixLengthInput },
			{ label: 'Signal length', input: settingTrixSignalInput },
		],
	},
	"Williams %R (14)": {
		title: 'Williams %R (14)',
		fields: [{ label: 'Length', input: settingWprLengthInput }],
	},
	'BIAS 20': {
		title: 'BIAS 20',
		fields: [{ label: 'Length', input: settingBiasLengthInput }],
	},
	MACD: {
		title: 'MACD',
		fields: [
			{ label: 'Fast length', input: settingMacdFastInput },
			{ label: 'Slow length', input: settingMacdSlowInput },
			{ label: 'Signal length', input: settingMacdSignalInput },
		],
	},
	'MACD Signal': {
		title: 'MACD',
		fields: [
			{ label: 'Fast length', input: settingMacdFastInput },
			{ label: 'Slow length', input: settingMacdSlowInput },
			{ label: 'Signal length', input: settingMacdSignalInput },
		],
	},
	'MACD Hist': {
		title: 'MACD',
		fields: [
			{ label: 'Fast length', input: settingMacdFastInput },
			{ label: 'Slow length', input: settingMacdSlowInput },
			{ label: 'Signal length', input: settingMacdSignalInput },
		],
	},
	'Keltner Upper': {
		title: 'Keltner Channel',
		fields: [
			{ label: 'EMA length', input: settingKeltnerMaLengthInput },
			{ label: 'ATR length', input: settingKeltnerAtrLengthInput },
			{ label: 'ATR mult', input: settingKeltnerMultInput },
		],
	},
	'Keltner Lower': {
		title: 'Keltner Channel',
		fields: [
			{ label: 'EMA length', input: settingKeltnerMaLengthInput },
			{ label: 'ATR length', input: settingKeltnerAtrLengthInput },
			{ label: 'ATR mult', input: settingKeltnerMultInput },
		],
	},
	'Keltner Basis': {
		title: 'Keltner Channel',
		fields: [
			{ label: 'EMA length', input: settingKeltnerMaLengthInput },
			{ label: 'ATR length', input: settingKeltnerAtrLengthInput },
			{ label: 'ATR mult', input: settingKeltnerMultInput },
		],
	},
	'Ichimoku Tenkan': {
		title: 'Ichimoku',
		fields: [
			{ label: 'Conversion', input: settingIchConvInput },
			{ label: 'Base', input: settingIchBaseInput },
			{ label: 'Span B', input: settingIchSpanBInput },
			{ label: 'Displacement', input: settingIchDisplacementInput },
		],
	},
	'Ichimoku Kijun': {
		title: 'Ichimoku',
		fields: [
			{ label: 'Conversion', input: settingIchConvInput },
			{ label: 'Base', input: settingIchBaseInput },
			{ label: 'Span B', input: settingIchSpanBInput },
			{ label: 'Displacement', input: settingIchDisplacementInput },
		],
	},
	'Ichimoku Span A': {
		title: 'Ichimoku',
		fields: [
			{ label: 'Conversion', input: settingIchConvInput },
			{ label: 'Base', input: settingIchBaseInput },
			{ label: 'Span B', input: settingIchSpanBInput },
			{ label: 'Displacement', input: settingIchDisplacementInput },
		],
	},
	'Ichimoku Span B': {
		title: 'Ichimoku',
		fields: [
			{ label: 'Conversion', input: settingIchConvInput },
			{ label: 'Base', input: settingIchBaseInput },
			{ label: 'Span B', input: settingIchSpanBInput },
			{ label: 'Displacement', input: settingIchDisplacementInput },
		],
	},
	'Ichimoku Chikou': {
		title: 'Ichimoku',
		fields: [
			{ label: 'Conversion', input: settingIchConvInput },
			{ label: 'Base', input: settingIchBaseInput },
			{ label: 'Span B', input: settingIchSpanBInput },
			{ label: 'Displacement', input: settingIchDisplacementInput },
		],
	},
	'ATR % 14': {
		title: 'ATR %',
		fields: [{ label: 'ATR length', input: settingAtrLengthInput }],
	},
	'ADX 14': {
		title: 'ADX 14',
		fields: [{ label: 'ADX length', input: settingAdxLengthInput }],
	},
	'+DI 14': {
		title: '+DI 14',
		fields: [{ label: 'ADX length', input: settingAdxLengthInput }],
	},
	'-DI 14': {
		title: '-DI 14',
		fields: [{ label: 'ADX length', input: settingAdxLengthInput }],
	},
	VWAP: {
		title: 'VWAP',
		fields: [],
	},
	OBV: {
		title: 'OBV',
		fields: [],
	},
	'VR (26)': {
		title: 'VR 26',
		fields: [{ label: 'Length', input: settingVrLengthInput }],
	},
	Price: {
		title: 'Price',
		fields: [
			{ label: 'Range bar size', input: settingRangeSizeInput },
			{ label: 'Renko box size', input: settingRenkoBoxSizeInput },
			{ label: 'Kagi reversal size', input: settingKagiReversalSizeInput },
		],
	},
	'Price Line': {
		title: 'Price Line',
		fields: [],
	},
	'Price Area': {
		title: 'Price Area',
		fields: [],
	},
	Volume: {
		title: 'Volume',
		fields: [],
	},
	'TSD Trend': {
		title: 'Time series decomposition',
		fields: [
			{ label: 'Trend length', input: settingTsdTrendLengthInput },
			{ label: 'Season length', input: settingTsdSeasonLengthInput },
			{ label: 'Season smoothing', input: settingTsdSeasonSmoothingInput },
			{
				label: 'Residual std window',
				input: settingTsdResidualStdWindowInput,
			},
		],
	},
	'TSD Seasonality': {
		title: 'Time series decomposition',
		fields: [
			{ label: 'Trend length', input: settingTsdTrendLengthInput },
			{ label: 'Season length', input: settingTsdSeasonLengthInput },
			{ label: 'Season smoothing', input: settingTsdSeasonSmoothingInput },
			{
				label: 'Residual std window',
				input: settingTsdResidualStdWindowInput,
			},
		],
	},
	'TSD Residual': {
		title: 'Time series decomposition',
		fields: [
			{ label: 'Trend length', input: settingTsdTrendLengthInput },
			{ label: 'Season length', input: settingTsdSeasonLengthInput },
			{ label: 'Season smoothing', input: settingTsdSeasonSmoothingInput },
			{
				label: 'Residual std window',
				input: settingTsdResidualStdWindowInput,
			},
		],
	},
};

let lastIndicatorSeriesName = null;
let lastIndicatorSeriesType = null;
let lastIndicatorSeriesTime = 0;
const HOVER_STALE_INTERVAL_MS = 2500;
const MANUAL_DOUBLECLICK_INTERVAL_MS = 900;
const MANUAL_DOUBLECLICK_DISTANCE_PX = 48;
const POPUP_CLOSE_GRACE_MS = 500;
let lastIndicatorPopupOpenedAt = 0;
let lastChartClickTimestamp = 0;
let lastChartClickX = Number.NaN;
let lastChartClickY = Number.NaN;
let lastChartClickSeriesName = null;
let lastChartClickSeriesType = null;

function openDefaultIndicatorPopup(nativeEvent) {
	const config = indicatorPopupConfigsBySeries.Price;
	if (!config) return;
	if (nativeEvent && typeof nativeEvent.stopPropagation === 'function') {
		nativeEvent.stopPropagation();
	}
	closeSettingsPanel();
	openIndicatorPopup(config, nativeEvent, 'Price', 'candlestick');
}

function openIndicatorPopupForSeries(seriesName, seriesType, nativeEvent) {
	let targetName = typeof seriesName === 'string' ? seriesName : null;
	let targetType = seriesType || null;
	const now = Date.now();
	if (
		(!targetName || !indicatorPopupConfigsBySeries[targetName]) &&
		lastIndicatorSeriesName &&
		now - lastIndicatorSeriesTime <= HOVER_STALE_INTERVAL_MS
	) {
		targetName = lastIndicatorSeriesName;
		targetType = lastIndicatorSeriesType;
	}
	if (!targetName || !indicatorPopupConfigsBySeries[targetName]) {
		openDefaultIndicatorPopup(nativeEvent);
		return;
	}
	const config = indicatorPopupConfigsBySeries[targetName];
	if (!config) {
		openDefaultIndicatorPopup(nativeEvent);
		return;
	}
	if (nativeEvent && typeof nativeEvent.stopPropagation === 'function') {
		nativeEvent.stopPropagation();
	}
	closeSettingsPanel();
	openIndicatorPopup(config, nativeEvent, targetName, targetType);
}

function getClientCoords(nativeEvent) {
	const e = nativeEvent || {};
	const x =
		typeof e.clientX === 'number'
			? e.clientX
			: typeof e.offsetX === 'number'
				? e.offsetX
				: Number.NaN;
	const y =
		typeof e.clientY === 'number'
			? e.clientY
			: typeof e.offsetY === 'number'
				? e.offsetY
				: Number.NaN;
	return { x, y };
}

function handleCanvasClickForDouble(seriesName, seriesType, nativeEvent) {
	const now = Date.now();
	const { x: clientX, y: clientY } = getClientCoords(nativeEvent);
	const timeDelta = now - lastChartClickTimestamp;
	const dx = clientX - lastChartClickX;
	const dy = clientY - lastChartClickY;
	const distanceSq = dx * dx + dy * dy;
	const distanceOk =
		Number.isFinite(distanceSq) &&
		distanceSq <= MANUAL_DOUBLECLICK_DISTANCE_PX * MANUAL_DOUBLECLICK_DISTANCE_PX;

	if (
		lastChartClickTimestamp !== 0 &&
		timeDelta <= MANUAL_DOUBLECLICK_INTERVAL_MS &&
		distanceOk
	) {
		let effectiveName = seriesName;
		let effectiveType = seriesType;
		if (!effectiveName && lastChartClickSeriesName) {
			effectiveName = lastChartClickSeriesName;
			effectiveType = lastChartClickSeriesType;
		}
		openIndicatorPopupForSeries(effectiveName, effectiveType, nativeEvent);
		lastChartClickTimestamp = 0;
		lastChartClickX = Number.NaN;
		lastChartClickY = Number.NaN;
		lastChartClickSeriesName = null;
		lastChartClickSeriesType = null;
		return true;
	}

	lastChartClickTimestamp = now;
	lastChartClickX = clientX;
	lastChartClickY = clientY;
	lastChartClickSeriesName = seriesName;
	lastChartClickSeriesType = seriesType;
	return false;
}

function openIndicatorPopup(config, nativeEvent, seriesName, seriesType) {
	if (!indicatorPopup || !indicatorPopupTitle || !indicatorPopupBody) return;
	indicatorPopupTitle.textContent = config.title;
	indicatorPopupBody.textContent = '';
	const effectiveFields = Array.isArray(config.fields)
		? config.fields.filter(field => field && field.input)
		: [];
	if (!effectiveFields.length) {
		const info = document.createElement('div');
		info.textContent = 'No adjustable parameters for this indicator.';
		info.style.color = '#9ca3af';
		info.style.fontSize = '11px';
		indicatorPopupBody.appendChild(info);
	} else {
		const resetRow = document.createElement('div');
		resetRow.style.display = 'flex';
		resetRow.style.justifyContent = 'flex-end';
		resetRow.style.marginBottom = '4px';
		const resetBtn = document.createElement('button');
		resetBtn.type = 'button';
		resetBtn.textContent = 'Reset to defaults';
		resetBtn.style.border = 'none';
		resetBtn.style.background = 'transparent';
		resetBtn.style.color = '#60a5fa';
		resetBtn.style.fontSize = '10px';
		resetBtn.style.cursor = 'pointer';
		resetBtn.addEventListener('click', () => {
			effectiveFields.forEach(field => {
				if (!field.input) return;
				const def = field.input.defaultValue;
				if (typeof def === 'string' && def !== '') {
					field.input.value = def;
					if (field.popupInput) {
						field.popupInput.value = def;
					}
				}
			});
			if (seriesName && seriesType) {
				delete seriesStyleOverrides[seriesName];
			}
			render();
		});
		resetRow.appendChild(resetBtn);
		indicatorPopupBody.appendChild(resetRow);
	}
	effectiveFields.forEach(field => {
		if (!field.input) return;
		const row = document.createElement('label');
		const span = document.createElement('span');
		span.textContent = field.label;
		const input = document.createElement('input');
		input.type = 'number';
		if (field.input.min) input.min = field.input.min;
		if (field.input.max) input.max = field.input.max;
		if (field.input.step) input.step = field.input.step;
		input.value = field.input.value;
		row.appendChild(span);
		row.appendChild(input);
		indicatorPopupBody.appendChild(row);
		field.popupInput = input;
		input.addEventListener('change', () => {
			field.input.value = input.value;
			render();
		});
	});
	// style overrides section (per series)
	if (seriesName && seriesType) {
		const styleOverride = seriesStyleOverrides[seriesName] || {};
		seriesStyleOverrides[seriesName] = styleOverride;
		const styleSection = document.createElement('div');
		styleSection.style.marginTop = '4px';
		const styleHeader = document.createElement('div');
		styleHeader.textContent = 'Style';
		styleHeader.style.fontSize = '11px';
		styleHeader.style.fontWeight = '600';
		styleHeader.style.color = '#9ca3af';
		styleHeader.style.marginBottom = '2px';
		styleSection.appendChild(styleHeader);

		function addStyleRow(labelText, inputEl) {
			const row = document.createElement('label');
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.justifyContent = 'space-between';
			row.style.marginBottom = '2px';
			row.style.gap = '6px';
			const span = document.createElement('span');
			span.textContent = labelText;
			row.appendChild(span);
			row.appendChild(inputEl);
			styleSection.appendChild(row);
		}

		if (seriesType === 'line') {
			const colorInput = document.createElement('input');
			colorInput.type = 'color';
			colorInput.value = styleOverride.lineColor || '#ffffff';
			colorInput.addEventListener('input', () => {
				styleOverride.lineColor = colorInput.value;
				render();
			});
			addStyleRow('Line color', colorInput);

			const widthInput = document.createElement('input');
			widthInput.type = 'number';
			widthInput.min = '0';
			widthInput.step = '0.5';
			if (typeof styleOverride.lineWidth === 'number') {
				widthInput.value = String(styleOverride.lineWidth);
			}
			widthInput.addEventListener('change', () => {
				const v = Number.parseFloat(widthInput.value);
				styleOverride.lineWidth = Number.isFinite(v) ? v : undefined;
				render();
			});
			addStyleRow('Line width', widthInput);

			const opacityInput = document.createElement('input');
			opacityInput.type = 'number';
			opacityInput.min = '0';
			opacityInput.max = '1';
			opacityInput.step = '0.05';
			if (typeof styleOverride.lineOpacity === 'number') {
				opacityInput.value = String(styleOverride.lineOpacity);
			}
			opacityInput.addEventListener('change', () => {
				const v = Number.parseFloat(opacityInput.value);
				styleOverride.lineOpacity = Number.isFinite(v) ? v : undefined;
				render();
			});
			addStyleRow('Line opacity', opacityInput);

			const dashSelect = document.createElement('select');
			['', 'solid', 'dashed', 'dotted'].forEach(val => {
				const opt = document.createElement('option');
				opt.value = val;
				opt.textContent = val === '' ? 'default' : val;
				if (val === (styleOverride.lineDash || '')) {
					opt.selected = true;
				}
				dashSelect.appendChild(opt);
			});
			dashSelect.addEventListener('change', () => {
				styleOverride.lineDash = dashSelect.value || undefined;
				render();
			});
			addStyleRow('Dash', dashSelect);

			const supportsArea =
				seriesName === 'Price Area' ||
				seriesName === 'Ichimoku Span A' ||
				seriesName === 'Ichimoku Span B';
			if (supportsArea) {
				const areaColorInput = document.createElement('input');
				areaColorInput.type = 'color';
				areaColorInput.value = styleOverride.areaColor || '#3b82f6';
				areaColorInput.addEventListener('input', () => {
					styleOverride.areaColor = areaColorInput.value;
						render();
				});
				addStyleRow('Area color', areaColorInput);

				const areaOpacityInput = document.createElement('input');
				areaOpacityInput.type = 'number';
				areaOpacityInput.min = '0';
				areaOpacityInput.max = '1';
				areaOpacityInput.step = '0.05';
				if (typeof styleOverride.areaOpacity === 'number') {
					areaOpacityInput.value = String(styleOverride.areaOpacity);
				}
				areaOpacityInput.addEventListener('change', () => {
					const v = Number.parseFloat(areaOpacityInput.value);
					styleOverride.areaOpacity = Number.isFinite(v) ? v : undefined;
					render();
				});
				addStyleRow('Area opacity', areaOpacityInput);
			}
		} else if (seriesType === 'candlestick' && seriesName === 'Price') {
			const upColorInput = document.createElement('input');
			upColorInput.type = 'color';
			upColorInput.value = styleOverride.upColor || '#22c55e';
			upColorInput.addEventListener('input', () => {
				styleOverride.upColor = upColorInput.value;
				render();
			});
			addStyleRow('Up color', upColorInput);

			const downColorInput = document.createElement('input');
			downColorInput.type = 'color';
			downColorInput.value = styleOverride.downColor || '#ef4444';
			downColorInput.addEventListener('input', () => {
				styleOverride.downColor = downColorInput.value;
				render();
			});
			addStyleRow('Down color', downColorInput);
		} else if (seriesType === 'scatter' && seriesName === 'Parabolic SAR') {
			const dotColorInput = document.createElement('input');
			dotColorInput.type = 'color';
			dotColorInput.value = styleOverride.markerColor || '#facc15';
			dotColorInput.addEventListener('input', () => {
				styleOverride.markerColor = dotColorInput.value;
				render();
			});
			addStyleRow('Dot color', dotColorInput);

			const dotOpacityInput = document.createElement('input');
			dotOpacityInput.type = 'number';
			dotOpacityInput.min = '0';
			dotOpacityInput.max = '1';
			dotOpacityInput.step = '0.05';
			if (typeof styleOverride.markerOpacity === 'number') {
				dotOpacityInput.value = String(styleOverride.markerOpacity);
			}
			dotOpacityInput.addEventListener('change', () => {
				const v = Number.parseFloat(dotOpacityInput.value);
				styleOverride.markerOpacity = Number.isFinite(v) ? v : undefined;
				render();
			});
			addStyleRow('Dot opacity', dotOpacityInput);
		} else if (seriesType === 'bar' && seriesName === 'Volume') {
			const barColorInput = document.createElement('input');
			barColorInput.type = 'color';
			barColorInput.value = styleOverride.barColor || '#22c55e';
			barColorInput.addEventListener('input', () => {
				styleOverride.barColor = barColorInput.value;
				render();
			});
			addStyleRow('Bar color', barColorInput);

			const barOpacityInput = document.createElement('input');
			barOpacityInput.type = 'number';
			barOpacityInput.min = '0';
			barOpacityInput.max = '1';
			barOpacityInput.step = '0.05';
			if (typeof styleOverride.barOpacity === 'number') {
				barOpacityInput.value = String(styleOverride.barOpacity);
			}
			barOpacityInput.addEventListener('change', () => {
				const v = Number.parseFloat(barOpacityInput.value);
				styleOverride.barOpacity = Number.isFinite(v) ? v : undefined;
				render();
			});
			addStyleRow('Bar opacity', barOpacityInput);
		} else if (seriesType === 'bar' && seriesName === 'MACD Hist') {
			const posColorInput = document.createElement('input');
			posColorInput.type = 'color';
			posColorInput.value = styleOverride.barPositiveColor || '#22c55e';
			posColorInput.addEventListener('input', () => {
				styleOverride.barPositiveColor = posColorInput.value;
				render();
			});
			addStyleRow('Up bar color', posColorInput);

			const negColorInput = document.createElement('input');
			negColorInput.type = 'color';
			negColorInput.value = styleOverride.barNegativeColor || '#ef4444';
			negColorInput.addEventListener('input', () => {
				styleOverride.barNegativeColor = negColorInput.value;
				render();
			});
			addStyleRow('Down bar color', negColorInput);

			const histOpacityInput = document.createElement('input');
			histOpacityInput.type = 'number';
			histOpacityInput.min = '0';
			histOpacityInput.max = '1';
			histOpacityInput.step = '0.05';
			if (typeof styleOverride.barOpacity === 'number') {
				histOpacityInput.value = String(styleOverride.barOpacity);
			}
			histOpacityInput.addEventListener('change', () => {
				const v = Number.parseFloat(histOpacityInput.value);
				styleOverride.barOpacity = Number.isFinite(v) ? v : undefined;
				render();
			});
			addStyleRow('Bar opacity', histOpacityInput);
		}

		indicatorPopupBody.appendChild(styleSection);
	}

	const padding = 12;
	const vw = document.documentElement.clientWidth || window.innerWidth;
	const vh = document.documentElement.clientHeight || window.innerHeight;
	const ev = nativeEvent;
	if (!ev || typeof ev.clientX !== 'number' || typeof ev.clientY !== 'number') {
		indicatorPopup.style.display = 'block';
		indicatorPopup.style.left = `${padding}px`;
		indicatorPopup.style.top = `${padding}px`;
		return;
	}
	indicatorPopup.style.display = 'block';
	indicatorPopup.style.left = '0px';
	indicatorPopup.style.top = '0px';
	indicatorPopup.style.visibility = 'hidden';
	const rect = indicatorPopup.getBoundingClientRect();
	let left = ev.clientX + 10;
	let top = ev.clientY + 10;
	if (left + rect.width + padding > vw) {
		left = vw - rect.width - padding;
	}
	if (left < padding) left = padding;
	if (top + rect.height + padding > vh) {
		top = vh - rect.height - padding;
	}
	if (top < padding) top = padding;
	indicatorPopup.style.left = `${left}px`;
	indicatorPopup.style.top = `${top}px`;
	indicatorPopup.style.visibility = 'visible';
	lastIndicatorPopupOpenedAt = Date.now();
}

function closeIndicatorPopup() {
	if (!indicatorPopup) return;
	indicatorPopup.style.display = 'none';
}

function openSettingsPanel() {
	if (!indicatorSettingsPanel) return;
	indicatorSettingsPanel.style.display = 'block';
}

function closeSettingsPanel() {
	if (!indicatorSettingsPanel) return;
	indicatorSettingsPanel.style.display = 'none';
}

function buildOption() {
	const raw = getTimeframeData();
	const baseData = applyRangeToData(raw, rangeKey);
	const indicatorSettings = getIndicatorSettings();
	const uiRangeSize = readNonNegativeNumber(settingRangeSizeInput, 0);
	const uiRenkoBoxSize = readNonNegativeNumber(settingRenkoBoxSizeInput, 0);
	const uiKagiReversalSize = readNonNegativeNumber(settingKagiReversalSizeInput, 0);
	const useRangeBars = chartMode === 'range';
	const useRenko = chartMode === 'renko';
	const useKagi = chartMode === 'kagi';
	const use3dMain = chartMode === '3d';
	let data = baseData;
	if (useRangeBars) {
		data = buildRangeBars(baseData, uiRangeSize);
	} else if (useRenko) {
		data = buildRenkoBricks(baseData, uiRenkoBoxSize);
	} else if (useKagi) {
		data = buildKagiLines(baseData, uiKagiReversalSize);
	}
	const categories = data.map((_, idx) => idx);

	const lineValues = convertToLineData(data);
	const candleValues = data.map(bar => [bar.open, bar.close, bar.low, bar.high]);
	const heikinValues = [];
	if (data.length) {
		let haClose = (data[0].open + data[0].high + data[0].low + data[0].close) / 4;
		let haOpen = (data[0].open + data[0].close) / 2;
		let haHigh = Math.max(data[0].high, haOpen, haClose);
		let haLow = Math.min(data[0].low, haOpen, haClose);
		heikinValues.push([haOpen, haClose, haLow, haHigh]);
		for (let i = 1; i < data.length; i++) {
			const prevHa = heikinValues[i - 1];
			const prevHaOpen = prevHa[0];
			const prevHaClose = prevHa[1];
			const bar = data[i];
			haOpen = (prevHaOpen + prevHaClose) / 2;
			haClose = (bar.open + bar.high + bar.low + bar.close) / 4;
			haHigh = Math.max(bar.high, haOpen, haClose);
			haLow = Math.min(bar.low, haOpen, haClose);
			heikinValues.push([haOpen, haClose, haLow, haHigh]);
		}
	}

	const axisWindowBars = Math.min(
		data.length,
		Math.max(120, Math.floor(data.length * 0.5))
	);
	const axisSlice =
		axisWindowBars > 0 ? data.slice(data.length - axisWindowBars) : data.slice();
	let paddedRange = computeVisiblePriceRange(axisSlice, {
		isLogScale,
	});
	if (!paddedRange) {
		paddedRange = computeVisiblePriceRange(data, { isLogScale });
	}
	if (!paddedRange) {
		paddedRange = { min: 0, max: 1 };
	}
	let axisMinValue = Number.isFinite(paddedRange.min) ? paddedRange.min : undefined;
	let axisMaxValue = Number.isFinite(paddedRange.max) ? paddedRange.max : undefined;
	if (isLogScale && axisMinValue !== undefined && axisMinValue <= 0) {
		axisMinValue = 1e-6;
	}
	if (
		axisMinValue !== undefined &&
		axisMaxValue !== undefined &&
		axisMaxValue <= axisMinValue
	) {
		axisMaxValue = axisMinValue + 1;
	}
	const yAxisMin = axisMinValue;
	const yAxisMax = axisMaxValue;

	const isHeikinMode = chartMode === 'heikin';
	const isOhlcMode = chartMode === 'ohlc';
	const candleItemStyle = isOhlcMode
		? {
				color: 'rgba(15,23,42,0)',
				color0: 'rgba(15,23,42,0)',
				borderColor: '#e5e7eb',
				borderColor0: '#e5e7eb',
		  }
		: {
				color: '#22c55e',
				color0: '#ef4444',
				borderColor: '#22c55e',
				borderColor0: '#ef4444',
		  };
	const candleBarWidth = isOhlcMode ? 2 : '65%';
	const ema = computeEMA(lineValues, indicatorSettings.emaLength);
	const emaFast = computeEMA(lineValues, indicatorSettings.emaFastLength);
	const emaSlow = computeEMA(lineValues, indicatorSettings.emaSlowLength);
	const sma = computeSMA(lineValues, indicatorSettings.smaLength);
	const bb = computeBB(lineValues, indicatorSettings.bbLength, indicatorSettings.bbMult);
	const donch = computeDonchian(data, indicatorSettings.donchianLength);
	const keltner = computeKeltner(
		data,
		lineValues,
		indicatorSettings.keltnerMaLength,
		indicatorSettings.keltnerAtrLength,
		indicatorSettings.keltnerMult
	);
	const rsi = computeRSI(lineValues, indicatorSettings.rsiLength);
	const stoch = computeStochastic(
		data,
		indicatorSettings.stochLength,
		indicatorSettings.stochSmoothing
	);
	const cci = computeCCI(data, indicatorSettings.cciLength);
	const wpr = computeWilliamsR(data, indicatorSettings.wprLength);
	const momentum = computeMomentum(lineValues, indicatorSettings.momentumLength);
	const roc = computeROC(lineValues, indicatorSettings.rocLength);
	const bias = computeBIAS(lineValues, indicatorSettings.biasLength);
	const dma = computeDMA(
		lineValues,
		indicatorSettings.dmaFastLength,
		indicatorSettings.dmaSlowLength
	);
	const trix = computeTRIX(
		lineValues,
		indicatorSettings.trixLength,
		indicatorSettings.trixSignal
	);
	const vr = computeVR(data, indicatorSettings.vrLength);
	const atr = computeATR(data, indicatorSettings.atrLength);
	const adxResult = computeADX(data, indicatorSettings.adxLength);
	const ichimoku = computeIchimoku(data, {
		conversionPeriod: indicatorSettings.ichConv,
		basePeriod: indicatorSettings.ichBase,
		spanBPeriod: indicatorSettings.ichSpanB,
		displacement: indicatorSettings.ichDisplacement,
	});
	const macd = computeMACD(lineValues, {
		fast: indicatorSettings.macdFast,
		slow: indicatorSettings.macdSlow,
		signal: indicatorSettings.macdSignal,
	});
	const volume = computeVolume(data);
	const obv = computeOBV(data);
	const vwap = computeVWAP(data);
	const psar = computeParabolicSAR(
		data,
		indicatorSettings.psarStep,
		indicatorSettings.psarMaxStep
	);
	const tsdConfig = {
		trendLength: indicatorSettings.tsdTrendLength,
		trendMethod: 'sma',
		centered: true,
		seasonLength:
			indicatorSettings.tsdSeasonLength || getDefaultTsdSeasonLength(timeframe),
		seasonSmoothing: indicatorSettings.tsdSeasonSmoothing,
		normalizeSeasonality: indicatorSettings.tsdNormalizeSeasonality,
		residualStdWindow: indicatorSettings.tsdResidualStdWindow,
		standardizeResiduals: indicatorSettings.tsdStandardizeResiduals,
		model:
			indicatorSettings.tsdModel === 'multiplicative'
				? 'multiplicative'
				: 'additive',
	};
	const tsdResult = computeDecomposition(lineValues, tsdConfig);

	const emaSeriesData = mapToBase(data, ema);
	const emaFastSeriesData = mapToBase(data, emaFast);
	const emaSlowSeriesData = mapToBase(data, emaSlow);
	const smaSeriesData = mapToBase(data, sma);
	const bbUpper = mapToBase(data, bb.upper);
	const bbLower = mapToBase(data, bb.lower);
	const bbBasis = mapToBase(data, bb.basis);
	const keltnerUpperData = mapToBase(data, keltner.upper);
	const keltnerLowerData = mapToBase(data, keltner.lower);
	const keltnerBasisData = mapToBase(data, keltner.basis);
	const donchUpperData = mapToBase(data, donch.upper);
	const donchLowerData = mapToBase(data, donch.lower);
	const donchMidData = mapToBase(data, donch.mid);
	const rsiData = mapToBase(data, rsi);
	const stochKData = mapToBase(data, stoch.k);
	const stochDData = mapToBase(data, stoch.d);
	const kdjJPoints = stoch.k.map((p, idx) => {
		const d = stoch.d[idx];
		const dVal = d ? d.value : p.value;
		return { time: p.time, value: 3 * p.value - 2 * dVal };
	});
	const kdjJData = mapToBase(data, kdjJPoints);
	const wprData = mapToBase(data, wpr);
	const cciData = mapToBase(data, cci);
	const momentumData = mapToBase(data, momentum);
	const rocData = mapToBase(data, roc);
	const biasData = mapToBase(data, bias);
	const dmaData = mapToBase(data, dma);
	const trixData = mapToBase(data, trix.trix);
	const trixSignalData = mapToBase(data, trix.signal);
	const vrData = mapToBase(data, vr);
	const adxData = mapToBase(data, adxResult.adx);
	const diPlusData = mapToBase(data, adxResult.diPlus);
	const diMinusData = mapToBase(data, adxResult.diMinus);
	const atrData = mapToBase(data, atr);
	const ichTenkanData = mapToBase(data, ichimoku.tenkan);
	const ichKijunData = mapToBase(data, ichimoku.kijun);
	const ichSpanAData = mapToBase(data, ichimoku.spanA);
	const ichSpanBData = mapToBase(data, ichimoku.spanB);
	const ichChikouData = mapToBase(data, ichimoku.chikou);
	const macdLine = mapToBase(data, macd.macd);
	const macdSignal = mapToBase(data, macd.signal);
	const macdHist = mapHistToBase(data, macd.hist);
	const volumeData = mapVolumeToBase(data, volume);
	const obvData = mapToBase(data, obv);
	const vwapData = mapToBase(data, vwap);
	const psarData = mapToBase(data, psar);
	const priceLineData = mapToBase(data, lineValues);
	const tsdTrendData = mapToBase(data, tsdResult.trend);
	const tsdSeasonData = mapToBase(data, tsdResult.seasonal);
	const tsdResidualData = mapToBase(data, tsdResult.residual);

	let showCandles = toggleCandles?.checked ?? true;
	const showEMA = toggleEMA?.checked ?? true;
	const showEMAFast = toggleEMA20?.checked ?? false;
	const showEMASlow = toggleEMA100?.checked ?? false;
	const showSMA = toggleSMA?.checked ?? false;
	const showBB = toggleBB?.checked ?? false;
	const showKeltner = toggleKeltner?.checked ?? false;
	const showIchimoku = toggleIchimoku?.checked ?? false;
	const showVWAP = toggleVWAP?.checked ?? false;
	const showPSAR = togglePSAR?.checked ?? false;
	const showDonchian = toggleDonchian?.checked ?? false;
	const showVolume = toggleVolume?.checked ?? true;
	let showPriceLine = togglePriceLine?.checked ?? false;
	let showPriceArea = togglePriceArea?.checked ?? false;
	const showRSI = toggleRSI?.checked ?? false;
	const showStoch = toggleStoch?.checked ?? false;
	const showKDJ = toggleKDJ?.checked ?? false;
	const showCCI = toggleCCI?.checked ?? false;
	const showBIAS = toggleBIAS?.checked ?? false;
	const showMomentum = toggleMomentum?.checked ?? false;
	const showROC = toggleROC?.checked ?? false;
	const showVR = toggleVR?.checked ?? false;
	const showWPR = toggleWPR?.checked ?? false;
	const showATR = toggleATR?.checked ?? false;
	const showADX = toggleADX?.checked ?? false;
	const showOBV = toggleOBV?.checked ?? false;
	const showMACD = toggleMACD?.checked ?? false;
	const showDMA = toggleDMA?.checked ?? false;
	const showTRIX = toggleTRIX?.checked ?? false;
	const showTsdTrend = toggleTsdTrend?.checked ?? false;
	const showTsdSeasonality = toggleTsdSeasonality?.checked ?? false;
	const showTsdResidual = toggleTsdResidual?.checked ?? false;

	if (chartMode === 'line') {
		showCandles = false;
		showPriceLine = true;
	} else if (chartMode === 'area') {
		showCandles = false;
		showPriceArea = true;
	}

	const oscillatorGroups = [];

	function addOscillatorGroup(enabled, buildSeries) {
		if (!enabled) return;
		oscillatorGroups.push(buildSeries);
	}

	addOscillatorGroup(showRSI, (xAxisIndex, yAxisIndex) => [
		{
			name: 'RSI',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: rsiData,
			showSymbol: false,
			lineStyle: { color: '#f97316', width: 1.5 },
		},
	]);

	addOscillatorGroup(showDMA, (xAxisIndex, yAxisIndex) => [
		{
			name: 'DMA (10, 50)',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: dmaData,
			showSymbol: false,
			lineStyle: { color: '#f97316', width: 1.2 },
		},
	]);

	addOscillatorGroup(showTRIX, (xAxisIndex, yAxisIndex) => [
		{
			name: 'TRIX (18, 9)',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: trixData,
			showSymbol: false,
			lineStyle: { color: '#10b981', width: 1.4 },
		},
		{
			name: 'TRIX Signal',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: trixSignalData,
			showSymbol: false,
			lineStyle: { color: '#22d3ee', width: 1.1 },
		},
	]);

	const showStochPane = showStoch || showKDJ;
	addOscillatorGroup(showStochPane, (xAxisIndex, yAxisIndex) => {
		const groupSeries = [];
		if (showStoch) {
			groupSeries.push(
				{
					name: 'Stoch %K',
					type: 'line',
					xAxisIndex,
					yAxisIndex,
					data: stochKData,
					showSymbol: false,
					lineStyle: { color: '#22d3ee', width: 1.2 },
				},
				{
					name: 'Stoch %D',
					type: 'line',
					xAxisIndex,
					yAxisIndex,
					data: stochDData,
					showSymbol: false,
					lineStyle: { color: '#a855f7', width: 1 },
				}
			);
		}
		if (showKDJ) {
			groupSeries.push({
				name: 'KDJ J',
				type: 'line',
				xAxisIndex,
				yAxisIndex,
				data: kdjJData,
				showSymbol: false,
				lineStyle: { color: '#ef4444', width: 1.2 },
			});
		}
		return groupSeries;
	});

	addOscillatorGroup(showCCI, (xAxisIndex, yAxisIndex) => [
		{
			name: 'CCI 20',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: cciData,
			showSymbol: false,
			lineStyle: { color: '#eab308', width: 1.2 },
		},
	]);

	addOscillatorGroup(showBIAS, (xAxisIndex, yAxisIndex) => [
		{
			name: 'BIAS 20',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: biasData,
			showSymbol: false,
			lineStyle: { color: '#fbbf24', width: 1.2 },
		},
	]);

	addOscillatorGroup(showMomentum, (xAxisIndex, yAxisIndex) => [
		{
			name: 'Momentum 10',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: momentumData,
			showSymbol: false,
			lineStyle: { color: '#22c55e', width: 1.2 },
		},
	]);

	addOscillatorGroup(showROC, (xAxisIndex, yAxisIndex) => [
		{
			name: 'ROC 10',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: rocData,
			showSymbol: false,
			lineStyle: { color: '#f97316', width: 1.2 },
		},
	]);

	addOscillatorGroup(showATR, (xAxisIndex, yAxisIndex) => [
		{
			name: 'ATR % 14',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: atrData,
			showSymbol: false,
			lineStyle: { color: '#f59e0b', width: 1.2 },
		},
	]);

	addOscillatorGroup(showADX, (xAxisIndex, yAxisIndex) => [
		{
			name: 'ADX 14',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: adxData,
			showSymbol: false,
			lineStyle: { color: '#e5e7eb', width: 1.4 },
		},
		{
			name: '+DI 14',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: diPlusData,
			showSymbol: false,
			lineStyle: { color: '#22c55e', width: 1.1 },
		},
		{
			name: '-DI 14',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: diMinusData,
			showSymbol: false,
			lineStyle: { color: '#ef4444', width: 1.1 },
		},
	]);

	addOscillatorGroup(showWPR, (xAxisIndex, yAxisIndex) => [
		{
			name: "Williams %R (14)",
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: wprData,
			showSymbol: false,
			lineStyle: { color: '#06b6d4', width: 1.2 },
		},
	]);

	addOscillatorGroup(showMACD, (xAxisIndex, yAxisIndex) => [
		{
			name: 'MACD',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: macdLine,
			showSymbol: false,
			lineStyle: { color: '#c084fc', width: 1.5 },
		},
		{
			name: 'MACD Signal',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: macdSignal,
			showSymbol: false,
			lineStyle: { color: '#22d3ee', width: 1.2 },
		},
		{
			name: 'MACD Hist',
			type: 'bar',
			xAxisIndex,
			yAxisIndex,
			data: macdHist,
			barWidth: '60%',
		},
	]);

	addOscillatorGroup(showOBV, (xAxisIndex, yAxisIndex) => [
		{
			name: 'OBV',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: obvData,
			showSymbol: false,
			lineStyle: { color: '#facc15', width: 1.2 },
		},
	]);

	addOscillatorGroup(showVR, (xAxisIndex, yAxisIndex) => [
		{
			name: 'VR (26)',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: vrData,
			showSymbol: false,
			lineStyle: { color: '#fb923c', width: 1.2 },
		},
	]);

	addOscillatorGroup(showTsdSeasonality, (xAxisIndex, yAxisIndex) => [
		{
			name: 'TSD Seasonality',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: tsdSeasonData,
			showSymbol: false,
			lineStyle: { color: '#38bdf8', width: 1.4 },
		},
	]);

	addOscillatorGroup(showTsdResidual, (xAxisIndex, yAxisIndex) => [
		{
			name: 'TSD Residual',
			type: 'line',
			xAxisIndex,
			yAxisIndex,
			data: tsdResidualData,
			showSymbol: false,
			lineStyle: { color: '#f97316', width: 1.4 },
		},
	]);

	const oscCount = oscillatorGroups.length;

	const mainAxisType = isLogScale ? 'log' : 'value';
	const mainTopPct = 1;
	const bottomMarginPct = 1;
	const availableSpan = 100 - mainTopPct - bottomMarginPct; // space we can actually use

	const grids = [];

	if (oscCount === 0) {
		// Single main pane (price + volume) taking almost the full height.
		const mainH = availableSpan;
		grids.push({
			left: 60,
			right: 80,
			top: `${mainTopPct}%`,
			height: `${mainH}%`,
		});
	} else {
		// When oscillators are enabled, keep the main pane dominant and
		// share the remaining vertical space across all oscillator lanes.
		// For many oscillators, the main pane still keeps at least ~50%.
		const minMainFrac = 0.5;
		const maxMainFrac = 0.75;
		const t = Math.min(1, (oscCount - 1) / 4); // 0 for 1 pane, ~1 for many
		const mainFrac = maxMainFrac - (maxMainFrac - minMainFrac) * t;
		const mainH = availableSpan * mainFrac;
		const oscSpan = Math.max(0, availableSpan - mainH);
		const laneH = oscCount > 0 ? oscSpan / oscCount : 0;
		let currentTop = mainTopPct;
		grids.push({
			left: 60,
			right: 80,
			top: `${currentTop}%`,
			height: `${mainH}%`,
		});
		currentTop += mainH;
		for (let i = 0; i < oscCount; i++) {
			if (laneH <= 0) break;
			// Guard against rounding pushing us past the available span.
			if (currentTop >= mainTopPct + availableSpan) break;
			const remaining = mainTopPct + availableSpan - currentTop;
			const h = Math.min(laneH, remaining);
			grids.push({
				left: 60,
				right: 80,
				top: `${currentTop}%`,
				height: `${h}%`,
			});
			currentTop += h;
		}
	}

	const lastGridIndex = grids.length - 1;

	const xAxis = [];
	for (let i = 0; i < grids.length; i++) {
		const isMain = i === 0;
		const isLast = i === lastGridIndex;
		if (isMain) {
			xAxis.push({
				type: 'category',
				gridIndex: i,
				data: categories,
				boundaryGap: false,
				axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
				axisLabel: { color: '#64748b' },
			});
		} else {
			xAxis.push({
				type: 'category',
				gridIndex: i,
				data: categories,
				axisLabel: isLast ? { color: '#64748b' } : { show: false },
				axisTick: isLast ? undefined : { show: false },
				axisLine: isLast
					? { lineStyle: { color: 'rgba(148,163,184,0.6)' } }
					: { show: false },
				splitLine: isLast
					? { lineStyle: { color: 'rgba(30,64,175,0.25)' } }
					: undefined,
			});
		}
	}

	const yAxis = [
		(() => {
			const axisOptions = {
				type: mainAxisType,
				gridIndex: 0,
				scale: true,
				axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
				axisLabel: { color: '#9ca3af' },
				splitLine: { lineStyle: { color: 'rgba(30,64,175,0.35)' } },
			};
			if (yAxisMin !== undefined) {
				axisOptions.min = yAxisMin;
			}
			if (yAxisMax !== undefined) {
				axisOptions.max = yAxisMax;
			}
			return axisOptions;
		})(),
		{
			type: 'value',
			gridIndex: 0,
			min: 0,
			max: 1,
			axisLabel: { show: false },
			axisTick: { show: false },
			axisLine: { show: false },
			splitLine: { show: false },
		},
	];

	for (let i = 0; i < oscCount; i++) {
		const gridIndex = i + 1;
		yAxis.push({
			type: 'value',
			gridIndex,
			scale: true,
			min: 'dataMin',
			max: 'dataMax',
			axisLabel: { color: '#64748b', show: true },
			splitLine: {
				show: true,
				lineStyle: { color: 'rgba(30,64,175,0.25)' },
			},
		});
	}

	const series = [
			{
				name: 'Price',
				type: 'candlestick',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showCandles
					? isHeikinMode
						? heikinValues
						: candleValues
					: [],
				itemStyle: candleItemStyle,
				barWidth: candleBarWidth,
			},
			{
				name: 'EMA 50',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showEMA ? emaSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#38bdf8', width: 2 },
			},
			{
				name: 'EMA 20',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showEMAFast ? emaFastSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#4ade80', width: 1.5 },
			},
			{
				name: 'EMA 100',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showEMASlow ? emaSlowSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#6366f1', width: 1.5 },
			},
			{
				name: 'SMA 20',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showSMA ? smaSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#a3e635', width: 2 },
			},
			{
				name: 'BB Upper',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showBB ? bbUpper : [],
				showSymbol: false,
				lineStyle: { color: '#22c55e', width: 1.5 },
			},
			{
				name: 'BB Lower',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showBB ? bbLower : [],
				showSymbol: false,
				lineStyle: { color: '#ef4444', width: 1.5 },
			},
			{
				name: 'BB Basis',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showBB ? bbBasis : [],
				showSymbol: false,
				lineStyle: { color: '#e5e7eb', width: 1, type: 'dashed' },
			},
			{
				name: 'Keltner Upper',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showKeltner ? keltnerUpperData : [],
				showSymbol: false,
				lineStyle: { color: '#facc15', width: 1.3 },
			},
			{
				name: 'Keltner Lower',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showKeltner ? keltnerLowerData : [],
				showSymbol: false,
				lineStyle: { color: '#fb7185', width: 1.3 },
			},
			{
				name: 'Keltner Basis',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showKeltner ? keltnerBasisData : [],
				showSymbol: false,
				lineStyle: { color: '#e5e7eb', width: 1, type: 'dotted' },
			},
			{
				name: 'Ichimoku Tenkan',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showIchimoku ? ichTenkanData : [],
				showSymbol: false,
				lineStyle: { color: '#f97316', width: 1.2 },
			},
			{
				name: 'Ichimoku Kijun',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showIchimoku ? ichKijunData : [],
				showSymbol: false,
				lineStyle: { color: '#22d3ee', width: 1.2 },
			},
			{
				name: 'Ichimoku Span A',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showIchimoku ? ichSpanAData : [],
				showSymbol: false,
				lineStyle: { color: 'rgba(34,197,94,0.8)', width: 1 },
				areaStyle: { color: 'rgba(34,197,94,0.12)' },
			},
			{
				name: 'Ichimoku Span B',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showIchimoku ? ichSpanBData : [],
				showSymbol: false,
				lineStyle: { color: 'rgba(239,68,68,0.8)', width: 1 },
				areaStyle: { color: 'rgba(239,68,68,0.12)' },
			},
			{
				name: 'Ichimoku Chikou',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showIchimoku ? ichChikouData : [],
				showSymbol: false,
				lineStyle: { color: '#a855f7', width: 1 },
			},
			{
				name: 'VWAP',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showVWAP ? vwapData : [],
				showSymbol: false,
				lineStyle: { color: '#a855f7', width: 1.8 },
			},
			{
				name: 'Parabolic SAR',
				type: 'scatter',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showPSAR ? psarData : [],
				symbolSize: 5,
				itemStyle: { color: '#facc15' },
			},
			{
				name: 'Donchian Upper',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showDonchian ? donchUpperData : [],
				showSymbol: false,
				lineStyle: { color: '#f97316', width: 1.2 },
			},
			{
				name: 'Donchian Lower',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showDonchian ? donchLowerData : [],
				showSymbol: false,
				lineStyle: { color: '#0ea5e9', width: 1.2 },
			},
			{
				name: 'Donchian Mid',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showDonchian ? donchMidData : [],
				showSymbol: false,
				lineStyle: { color: '#e5e7eb', width: 1, type: 'dotted' },
			},
			{
				name: 'Price Line',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showPriceLine ? priceLineData : [],
				showSymbol: false,
				lineStyle: { color: '#fbbf24', width: 1.5 },
			},
			{
				name: 'Price Area',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showPriceArea ? priceLineData : [],
				showSymbol: false,
				lineStyle: { width: 0 },
				areaStyle: { color: 'rgba(59,130,246,0.35)' },
			},
			{
				name: 'TSD Trend',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: !use3dMain && showTsdTrend ? tsdTrendData : [],
				showSymbol: false,
				lineStyle: { color: '#eab308', width: 2 },
			},
			{
				name: 'Volume',
				type: 'bar',
				xAxisIndex: 0,
				yAxisIndex: 1,
				data: showVolume ? volumeData : [],
				barWidth: '60%',
			},
		];

	oscillatorGroups.forEach((buildGroupSeries, index) => {
		const xAxisIndex = index + 1;
		const yAxisIndex = 2 + index;
		const groupSeries = buildGroupSeries(xAxisIndex, yAxisIndex);
		if (Array.isArray(groupSeries)) {
			for (const s of groupSeries) {
				series.push(s);
			}
		}
	});

	if (use3dMain) {
		let mainZKey = read3DMainZSource();
		let mainZArray = rsiData;
		if (mainZKey === 'ema.50') {
			mainZArray = emaSeriesData;
		} else if (mainZKey === 'macd.line') {
			mainZArray = macdLine;
		} else if (mainZKey === 'obv') {
			mainZArray = obvData;
		} else if (mainZKey === 'atr.14') {
			mainZArray = atrData;
		} else if (mainZKey === 'adx.14') {
			mainZArray = adxData;
		} else {
			// fallback
			mainZKey = 'rsi.14';
			mainZArray = rsiData;
		}
		const zStats = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
		for (const v of mainZArray) {
			if (typeof v === 'number' && Number.isFinite(v)) {
				if (v < zStats.min) zStats.min = v;
				if (v > zStats.max) zStats.max = v;
			}
		}
		if (!Number.isFinite(zStats.min) || !Number.isFinite(zStats.max)) {
			zStats.min = 0;
			zStats.max = 1;
		}
		const series3d = [];
		if (showCandles) {
			const price3d = build3DSeriesData(data, priceLineData, mainZArray);
			if (price3d.length) {
				series3d.push({
					name: 'Price 3D',
					type: 'line3D',
					data: price3d,
					lineStyle: { width: 1.5, color: '#fbbf24' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
		}
		if (showEMA) {
			const ema3d = build3DSeriesData(data, emaSeriesData, mainZArray);
			if (ema3d.length) {
				series3d.push({
					name: 'EMA 50 3D',
					type: 'line3D',
					data: ema3d,
					lineStyle: { width: 1.8, color: '#38bdf8' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
		}
		if (showEMAFast) {
			const emaFast3d = build3DSeriesData(data, emaFastSeriesData, mainZArray);
			if (emaFast3d.length) {
				series3d.push({
					name: 'EMA 20 3D',
					type: 'line3D',
					data: emaFast3d,
					lineStyle: { width: 1.2, color: '#4ade80' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
		}
		if (showEMASlow) {
			const emaSlow3d = build3DSeriesData(data, emaSlowSeriesData, mainZArray);
			if (emaSlow3d.length) {
				series3d.push({
					name: 'EMA 100 3D',
					type: 'line3D',
					data: emaSlow3d,
					lineStyle: { width: 1.2, color: '#6366f1' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
		}
		if (showSMA) {
			const sma3d = build3DSeriesData(data, smaSeriesData, mainZArray);
			if (sma3d.length) {
				series3d.push({
					name: 'SMA 20 3D',
					type: 'line3D',
					data: sma3d,
					lineStyle: { width: 1.5, color: '#a3e635' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
		}
		if (showBB) {
			const bbUpper3d = build3DSeriesData(data, bbUpper, mainZArray);
			const bbLower3d = build3DSeriesData(data, bbLower, mainZArray);
			const bbBasis3d = build3DSeriesData(data, bbBasis, mainZArray);
			if (bbUpper3d.length) {
				series3d.push({
					name: 'BB Upper 3D',
					type: 'line3D',
					data: bbUpper3d,
					lineStyle: { width: 1.2, color: '#22c55e' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
			if (bbLower3d.length) {
				series3d.push({
					name: 'BB Lower 3D',
					type: 'line3D',
					data: bbLower3d,
					lineStyle: { width: 1.2, color: '#ef4444' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
			if (bbBasis3d.length) {
				series3d.push({
					name: 'BB Basis 3D',
					type: 'line3D',
					data: bbBasis3d,
					lineStyle: { width: 1, color: '#e5e7eb' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
		}
		if (showKeltner) {
			const kUpper3d = build3DSeriesData(data, keltnerUpperData, mainZArray);
			const kLower3d = build3DSeriesData(data, keltnerLowerData, mainZArray);
			const kBasis3d = build3DSeriesData(data, keltnerBasisData, mainZArray);
			if (kUpper3d.length) {
				series3d.push({
					name: 'Keltner Upper 3D',
					type: 'line3D',
					data: kUpper3d,
					lineStyle: { width: 1.2, color: '#facc15' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
			if (kLower3d.length) {
				series3d.push({
					name: 'Keltner Lower 3D',
					type: 'line3D',
					data: kLower3d,
					lineStyle: { width: 1.2, color: '#fb7185' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
			if (kBasis3d.length) {
				series3d.push({
					name: 'Keltner Basis 3D',
					type: 'line3D',
					data: kBasis3d,
					lineStyle: { width: 1, color: '#e5e7eb' },
					shading: 'color',
					grid3DIndex: 0,
				});
			}
		}
		for (const s of series3d) {
			series.push(s);
		}
	}

	applySeriesStyleOverrides(series);

	const option = {
		backgroundColor: '#020617',
		animation: false,
		grid: grids,
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'cross' },
			confine: true,
			backgroundColor: 'rgba(0,0,0,0)',
			borderWidth: 0,
			position: function (point, params, dom, rect, size) {
				return [12, 12];
			},
			formatter: function (params) {
				if (!Array.isArray(params)) {
					params = [params];
				}
				function toNumber(value) {
					return typeof value === 'number' && Number.isFinite(value) ? value : null;
				}
				function fmt(value) {
					var v = toNumber(value);
					return v === null ? '' : v.toFixed(6);
				}
				var groupConfig = {
					'BB Upper': { group: 'Bollinger Bands', label: 'upper' },
					'BB Lower': { group: 'Bollinger Bands', label: 'lower' },
					'BB Basis': { group: 'Bollinger Bands', label: 'basis' },
					'Keltner Upper': { group: 'Keltner', label: 'upper' },
					'Keltner Lower': { group: 'Keltner', label: 'lower' },
					'Keltner Basis': { group: 'Keltner', label: 'basis' },
					'Donchian Upper': { group: 'Donchian', label: 'upper' },
					'Donchian Lower': { group: 'Donchian', label: 'lower' },
					'Donchian Mid': { group: 'Donchian', label: 'mid' },
					'ADX 14': { group: 'ADX', label: 'adx' },
					'+DI 14': { group: 'ADX', label: '+di' },
					'-DI 14': { group: 'ADX', label: '-di' },
					'MACD': { group: 'MACD', label: 'line' },
					'MACD Signal': { group: 'MACD', label: 'signal' },
					'MACD Hist': { group: 'MACD', label: 'hist' },
					'Ichimoku Tenkan': { group: 'Ichimoku', label: 'tenkan' },
					'Ichimoku Kijun': { group: 'Ichimoku', label: 'kijun' },
					'Ichimoku Span A': { group: 'Ichimoku', label: 'span A' },
					'Ichimoku Span B': { group: 'Ichimoku', label: 'span B' },
					'Ichimoku Chikou': { group: 'Ichimoku', label: 'chikou' },
					'TSD Trend': { group: 'TSD', label: 'trend' },
					'TSD Seasonality': { group: 'TSD', label: 'season' },
					'TSD Residual': { group: 'TSD', label: 'residual' },
				};
				var lines = [];
				var priceEntry = null;
				var priceLineEntry = null;
				for (var i = 0; i < params.length; i++) {
					var p = params[i];
					if (!p) continue;
					if (p.seriesName === 'Price' && p.seriesType === 'candlestick') {
						priceEntry = p;
					} else if (p.seriesName === 'Price Line') {
						priceLineEntry = p;
					}
				}
				if (priceEntry && Array.isArray(priceEntry.data)) {
					var o = toNumber(priceEntry.data[0]);
					var c = toNumber(priceEntry.data[1]);
					var l = toNumber(priceEntry.data[2]);
					var h = toNumber(priceEntry.data[3]);
					var priceVal = null;
					if (priceLineEntry && priceLineEntry.data != null) {
						priceVal = typeof priceLineEntry.data === 'number'
							? priceLineEntry.data
							: (priceLineEntry.data && typeof priceLineEntry.data.value === 'number'
									? priceLineEntry.data.value
									: null);
					} else {
						priceVal = c;
					}
					var priceParts = [];
					if (priceVal !== null) priceParts.push('price ' + fmt(priceVal));
					if (o !== null) priceParts.push('open ' + fmt(o));
					if (c !== null) priceParts.push('close ' + fmt(c));
					if (l !== null) priceParts.push('lowest ' + fmt(l));
					if (h !== null) priceParts.push('highest ' + fmt(h));
					if (priceParts.length) {
						lines.push('Price ' + priceParts.join('  '));
					}
				}
				var groups = Object.create(null);
				for (var j = 0; j < params.length; j++) {
					var p2 = params[j];
					if (!p2 || p2.seriesName === 'Price') continue;
					var val = null;
					if (Array.isArray(p2.data)) {
						continue;
					} else if (p2.data && typeof p2.data.value === 'number') {
						val = p2.data.value;
					} else if (typeof p2.data === 'number') {
						val = p2.data;
					}
					val = toNumber(val);
					if (val === null) continue;
					var cfg = groupConfig[p2.seriesName];
					var gKey = cfg ? cfg.group : p2.seriesName;
					var label = cfg ? cfg.label : '';
					var g = groups[gKey];
					if (!g) {
						g = { label: gKey, parts: [] };
						groups[gKey] = g;
					}
					g.parts.push(label ? label + ' ' + fmt(val) : fmt(val));
				}
				for (var key in groups) {
					if (!Object.prototype.hasOwnProperty.call(groups, key)) continue;
					var g = groups[key];
					if (!g.parts.length) continue;
					lines.push(g.label + ' ' + g.parts.join('  '));
				}
				return lines.join('<br/>');
			},
		},
		dataZoom: [
			{
				type: 'inside',
				xAxisIndex: Array.from({ length: xAxis.length }, (_, i) => i),
				filterMode: 'filter',
				zoomOnMouseWheel: true,
				moveOnMouseMove: true,
				moveOnMouseWheel: false,
			},
		],
		xAxis,
		yAxis,
		series,
	};

	const yAxis3dMin = Number.isFinite(yAxisMin) ? yAxisMin : 0;
	let yAxis3dMax = Number.isFinite(yAxisMax) ? yAxisMax : yAxis3dMin + 1;
	if (yAxis3dMax <= yAxis3dMin) {
		yAxis3dMax = yAxis3dMin + 1;
	}

	if (use3dMain) {
		option.grid3D = {
			viewControl: {
				projection: 'perspective',
				distance: 160,
			},
			axisLine: {
				lineStyle: { color: 'rgba(148,163,184,0.8)' },
			},
			axisPointer: {
				lineStyle: { color: '#f97316' },
			},
			light: {
				main: { intensity: 1.2, shadow: true },
				ambient: { intensity: 0.4 },
			},
		};
		option.xAxis3D = {
			type: 'value',
			name: 'Index',
			axisLabel: { color: '#64748b' },
			axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
		};
		option.yAxis3D = {
			type: 'value',
			name: 'Price',
			min: yAxis3dMin,
			max: yAxis3dMax,
			axisLabel: { color: '#9ca3af' },
			axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
		};
		// z-axis bounds are derived from the chosen indicator via read3DMainZSource
		// and computed in zStats above; fall back to [0,1] if the series is empty.
		option.zAxis3D = {
			type: 'value',
			name: 'Z',
			min: zStats.min,
			max: zStats.max,
			axisLabel: { color: '#9ca3af' },
			axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
		};
	}

	return option;
}

function build3DInspectorOption() {
	if (!chart3dIndicator) {
		return null;
	}
	const raw = getTimeframeData();
	const baseDataLocal = applyRangeToData(raw, rangeKey);
	const indicatorSettings = getIndicatorSettings();
	const uiRangeSize = readNonNegativeNumber(settingRangeSizeInput, 0);
	const uiRenkoBoxSize = readNonNegativeNumber(settingRenkoBoxSizeInput, 0);
	const uiKagiReversalSize = readNonNegativeNumber(settingKagiReversalSizeInput, 0);
	const useRangeBars = chartMode === 'range';
	const useRenko = chartMode === 'renko';
	const useKagi = chartMode === 'kagi';
	let data = baseDataLocal;
	if (useRangeBars) {
		data = buildRangeBars(baseDataLocal, uiRangeSize);
	} else if (useRenko) {
		data = buildRenkoBricks(baseDataLocal, uiRenkoBoxSize);
	} else if (useKagi) {
		data = buildKagiLines(baseDataLocal, uiKagiReversalSize);
	}
	if (!Array.isArray(data) || data.length === 0) {
		return null;
	}
	const lineValues = convertToLineData(data);

	// Minimal indicator set needed for 3D inspector mapping
	const ema = computeEMA(lineValues, indicatorSettings.emaLength);
	const rsi = computeRSI(lineValues, indicatorSettings.rsiLength);
	const macd = computeMACD(lineValues, {
		fast: indicatorSettings.macdFast,
		slow: indicatorSettings.macdSlow,
		signal: indicatorSettings.macdSignal,
	});
	const volume = computeVolume(data);
	const obv = computeOBV(data);
	const atr = computeATR(data, indicatorSettings.atrLength);
	const adxResult = computeADX(data, indicatorSettings.adxLength);

	const emaSeriesData = mapToBase(data, ema);
	const rsiData = mapToBase(data, rsi);
	const macdLine = mapToBase(data, macd.macd);
	const macdHistMapped = mapHistToBase(data, macd.hist);
	const macdHist = macdHistMapped.map(p => (p ? p.value : null));
	const volumeVals = volume.map(v => v.value);
	const obvData = mapToBase(data, obv);
	const atrData = mapToBase(data, atr);
	const adxData = mapToBase(data, adxResult.adx);

	function getSeriesByKey(key) {
		switch (key) {
			case 'time':
				return data.map(bar => bar.time);
			case 'index':
				return data.map((_, idx) => idx);
			case 'price.close':
				return data.map(bar => bar.close);
			case 'price.high':
				return data.map(bar => bar.high);
			case 'price.low':
				return data.map(bar => bar.low);
			case 'volume':
				return volumeVals;
			case 'rsi.14':
				return rsiData;
			case 'ema.50':
				return emaSeriesData;
			case 'macd.line':
				return macdLine;
			case 'macd.hist':
				return macdHist;
			case 'obv':
				return obvData;
			case 'atr.14':
				return atrData;
			case 'adx.14':
				return adxData;
			default:
				return data.map(() => null);
		}
	}

	const xKey = setting3dIndicatorX?.value || 'time';
	const yKey = setting3dIndicatorY?.value || 'price.close';
	const zKey = setting3dIndicatorZ?.value || 'rsi.14';
	const xs = getSeriesByKey(xKey);
	const ys = getSeriesByKey(yKey);
	const zs = getSeriesByKey(zKey);
	const len = Math.min(xs.length, ys.length, zs.length);
	const data3d = [];
	const xStats = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
	const yStats = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
	const zStats = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
	for (let i = 0; i < len; i++) {
		const xv = xs[i];
		const yv = ys[i];
		const zv = zs[i];
		const x = typeof xv === 'number' ? xv : Number.NaN;
		const y = typeof yv === 'number' ? yv : Number.NaN;
		const z = typeof zv === 'number' ? zv : Number.NaN;
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
		data3d.push([x, y, z]);
		if (x < xStats.min) xStats.min = x;
		if (x > xStats.max) xStats.max = x;
		if (y < yStats.min) yStats.min = y;
		if (y > yStats.max) yStats.max = y;
		if (z < zStats.min) zStats.min = z;
		if (z > zStats.max) zStats.max = z;
	}
	if (!data3d.length) {
		return null;
	}
	if (!Number.isFinite(xStats.min) || !Number.isFinite(xStats.max)) {
		xStats.min = undefined;
		xStats.max = undefined;
	}
	if (!Number.isFinite(yStats.min) || !Number.isFinite(yStats.max)) {
		yStats.min = undefined;
		yStats.max = undefined;
	}
	if (!Number.isFinite(zStats.min) || !Number.isFinite(zStats.max)) {
		zStats.min = undefined;
		zStats.max = undefined;
	}

	const option = {
		backgroundColor: 'rgba(15,23,42,1)',
		tooltip: {
			trigger: 'item',
			confine: true,
			formatter: params => {
				if (!params || !Array.isArray(params.value)) return '';
				const v = params.value;
				return (
					`${xKey}: ${v[0].toFixed(6)}<br/>` +
					`${yKey}: ${v[1].toFixed(6)}<br/>` +
					`${zKey}: ${v[2].toFixed(6)}`
				);
			},
		},
		grid3D: {
			viewControl: {
				projection: 'perspective',
				distance: 120,
			},
			axisLine: {
				lineStyle: { color: 'rgba(148,163,184,0.8)' },
			},
			axisPointer: {
				lineStyle: { color: '#38bdf8' },
			},
			light: {
				main: { intensity: 1.0, shadow: false },
				ambient: { intensity: 0.4 },
			},
		},
		xAxis3D: {
			type: 'value',
			name: xKey,
			min: xStats.min,
			max: xStats.max,
			axisLabel: { color: '#64748b' },
			axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
		},
		yAxis3D: {
			type: 'value',
			name: yKey,
			min: yStats.min,
			max: yStats.max,
			axisLabel: { color: '#9ca3af' },
			axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
		},
		zAxis3D: {
			type: 'value',
			name: zKey,
			min: zStats.min,
			max: zStats.max,
			axisLabel: { color: '#9ca3af' },
			axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
		},
		series: [
			{
				name: '3D Inspector',
				type: 'line3D',
				data: data3d,
				lineStyle: { width: 1.5, color: '#38bdf8' },
				shading: 'color',
			},
		],
	};

	return option;
}

function render3dIndicator() {
	if (!chart3dIndicator || !chart3dIndicatorContainer) {
		return;
	}
	const enabled = toggle3DIndicator?.checked ?? false;
	if (!enabled) {
		chart3dIndicatorContainer.style.display = 'none';
		chart3dIndicator.clear();
		return;
	}
	const option = build3DInspectorOption();
	if (!option) {
		chart3dIndicatorContainer.style.display = 'none';
		chart3dIndicator.clear();
		return;
	}
	chart3dIndicatorContainer.style.display = 'block';
	chart3dIndicator.setOption(option, true);
}

function render() {
	let zoomState = null;
	if (typeof chart.getOption === 'function') {
		const prev = chart.getOption();
		if (prev && Array.isArray(prev.dataZoom) && prev.dataZoom.length > 0) {
			zoomState = prev.dataZoom.map(z => ({
				start: z.start,
				end: z.end,
				startValue: z.startValue,
				endValue: z.endValue,
			}));
		}
	}
	const option = buildOption();
	if (zoomState && Array.isArray(option.dataZoom)) {
		for (let i = 0; i < option.dataZoom.length && i < zoomState.length; i++) {
			const src = zoomState[i];
			const dz = option.dataZoom[i];
			if (!dz) continue;
			if (typeof src.start === 'number') dz.start = src.start;
			if (typeof src.end === 'number') dz.end = src.end;
			if (typeof src.startValue !== 'undefined') dz.startValue = src.startValue;
			if (typeof src.endValue !== 'undefined') dz.endValue = src.endValue;
		}
	}
	chart.setOption(option, true);
	render3dIndicator();
}

tfButtons.forEach(btn => {
	btn.addEventListener('click', () => {
		tfButtons.forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		const tf = btn.getAttribute('data-tf');
		if (tf) {
			timeframe = tf;
			render();
		}
	});
});

chartModeButtons.forEach(btn => {
	btn.addEventListener('click', () => {
		chartModeButtons.forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		const mode = btn.getAttribute('data-mode');
		if (
			mode === 'candles' ||
			mode === 'ohlc' ||
			mode === 'line' ||
			mode === 'area' ||
			mode === 'heikin' ||
			mode === 'range' ||
			mode === 'renko' ||
			mode === 'kagi' ||
			mode === '3d'
		) {
			chartMode = mode;
			render();
		}
	});
});

rangeButtons.forEach(btn => {
	btn.addEventListener('click', () => {
		rangeButtons.forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		const key = btn.getAttribute('data-range');
		if (key) {
			rangeKey = key;
			render();
		}
	});
});

	[
		toggleCandles,
		toggleEMA,
		toggleEMA20,
		toggleEMA100,
		toggleSMA,
		toggleBB,
		toggleKeltner,
		toggleIchimoku,
		toggleVWAP,
		toggleDonchian,
		togglePSAR,
		toggleVolume,
		toggleOBV,
		toggleVR,
		togglePriceLine,
		togglePriceArea,
		toggleRSI,
		toggleStoch,
		toggleKDJ,
		toggleCCI,
		toggleBIAS,
		toggleMomentum,
		toggleROC,
		toggleWPR,
		toggleADX,
		toggleATR,
		toggleMACD,
		toggleDMA,
		toggleTRIX,
	].forEach(el => {
	el?.addEventListener('change', render);
});

const settingsInputs = [
	settingEmaLengthInput,
	settingEmaFastLengthInput,
	settingEmaSlowLengthInput,
	settingSmaLengthInput,
	settingDmaFastLengthInput,
	settingDmaSlowLengthInput,
	settingBbLengthInput,
	settingBbMultInput,
	settingDonchianLengthInput,
	settingRsiLengthInput,
	settingStochLengthInput,
	settingStochSmoothingInput,
	settingCciLengthInput,
	settingWprLengthInput,
	settingMomLengthInput,
	settingRocLengthInput,
	settingBiasLengthInput,
	settingVrLengthInput,
	settingAtrLengthInput,
	settingAdxLengthInput,
	settingMacdFastInput,
	settingMacdSlowInput,
	settingMacdSignalInput,
	settingTrixLengthInput,
	settingTrixSignalInput,
	settingKeltnerMaLengthInput,
	settingKeltnerAtrLengthInput,
	settingKeltnerMultInput,
	settingIchConvInput,
	settingIchBaseInput,
	settingIchSpanBInput,
	settingIchDisplacementInput,
	settingPsarStepInput,
	settingPsarMaxStepInput,
	settingRangeSizeInput,
	settingRenkoBoxSizeInput,
	settingKagiReversalSizeInput,
];

settingsInputs.forEach(input => {
	input?.addEventListener('change', render);
});

if (logToggle) {
	logToggle.addEventListener('click', () => {
		isLogScale = !isLogScale;
		if (isLogScale) {
			logToggle.classList.add('active');
		} else {
			logToggle.classList.remove('active');
		}
		render();
	});
}

if (bottomClock) {
	function updateClock() {
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		const ss = String(now.getSeconds()).padStart(2, '0');
		bottomClock.textContent = `${hh}:${mm}:${ss}`;
	}
	updateClock();
	setInterval(updateClock, 1000);
}

if (indicatorToggle && indicatorMenu) {
	indicatorToggle.addEventListener('click', event => {
		event.stopPropagation();
		closeIndicatorPopup();
		const isOpen = indicatorMenu.style.display === 'block';
		indicatorMenu.style.display = isOpen ? 'none' : 'block';
		indicatorToggle.classList.toggle('active', !isOpen);
	});

	const sectionToggles = Array.from(
		indicatorMenu.querySelectorAll('.indicator-section-toggle')
	);
	sectionToggles.forEach(toggle => {
		toggle.addEventListener('click', event => {
			event.stopPropagation();
			const group = toggle.closest('.indicator-group');
			if (!group) {
				return;
			}
			const body = group.querySelector('.indicator-section-body');
			const caret = group.querySelector('.indicator-section-caret');
			if (!body) {
				return;
			}
			const isCollapsed = body.classList.contains(
				'indicator-section-body-collapsed'
			);
			if (isCollapsed) {
				body.classList.remove('indicator-section-body-collapsed');
				if (caret) {
					caret.textContent = '▾';
				}
			} else {
				body.classList.add('indicator-section-body-collapsed');
				if (caret) {
					caret.textContent = '▸';
				}
			}
		});
	});

	if (indicatorOpenAll) {
		indicatorOpenAll.addEventListener('click', event => {
			event.stopPropagation();
			const groups = Array.from(
				indicatorMenu.querySelectorAll('.indicator-group')
			);
			groups.forEach(group => {
				const body = group.querySelector('.indicator-section-body');
				const caret = group.querySelector('.indicator-section-caret');
				if (!body) {
					return;
				}
				body.classList.remove('indicator-section-body-collapsed');
				if (caret) {
					caret.textContent = '▾';
				}
			});
		});
	}

	if (indicatorCloseAll) {
		indicatorCloseAll.addEventListener('click', event => {
			event.stopPropagation();
			const groups = Array.from(
				indicatorMenu.querySelectorAll('.indicator-group')
			);
			groups.forEach(group => {
				const body = group.querySelector('.indicator-section-body');
				const caret = group.querySelector('.indicator-section-caret');
				if (!body) {
					return;
				}
				body.classList.add('indicator-section-body-collapsed');
				if (caret) {
					caret.textContent = '▸';
				}
			});
		});
	}

	document.addEventListener('click', event => {
		if (
			indicatorMenu.style.display === 'block' &&
			!indicatorMenu.contains(event.target) &&
			event.target !== indicatorToggle
		) {
			indicatorMenu.style.display = 'none';
			indicatorToggle.classList.remove('active');
		}
	});
}

if (perfPresetSelect) {
	perfPresetSelect.addEventListener('change', () => {
		const value = perfPresetSelect.value;
		if (value === 'light' || value === 'normal' || value === 'heavy') {
			applyPerfPreset(value);
		} else {
			applyPerfPreset('normal');
		}
	});
}

if (settingsToggle && indicatorSettingsPanel) {
	settingsToggle.addEventListener('click', event => {
		event.stopPropagation();
		const isOpen = indicatorSettingsPanel.style.display === 'block';
		if (isOpen) {
			closeSettingsPanel();
		} else {
			closeIndicatorPopup();
			openSettingsPanel();
		}
	});

	if (indicatorSettingsTabs.length && indicatorSettingsPageMain && indicatorSettingsPage3d) {
		indicatorSettingsTabs.forEach(tab => {
			const tabKey = tab.getAttribute('data-tab');
			if (!tabKey) return;
			tab.addEventListener('click', event => {
				event.stopPropagation();
				indicatorSettingsTabs.forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				if (tabKey === 'indicators') {
					indicatorSettingsPageMain.style.display = 'block';
					indicatorSettingsPage3d.style.display = 'none';
				} else if (tabKey === '3d') {
					indicatorSettingsPageMain.style.display = 'none';
					indicatorSettingsPage3d.style.display = 'block';
				}
			});
		});
		// Default: indicators tab visible, 3D tab hidden
		indicatorSettingsPageMain.style.display = 'block';
		indicatorSettingsPage3d.style.display = 'none';
	}

	if (indicatorSettingsClose) {
		indicatorSettingsClose.addEventListener('click', event => {
			event.stopPropagation();
			closeSettingsPanel();
		});
	}
	document.addEventListener('click', event => {
		if (
			indicatorSettingsPanel.style.display === 'block' &&
			!indicatorSettingsPanel.contains(event.target) &&
			event.target !== settingsToggle
		) {
			closeSettingsPanel();
		}
	});
}

if (indicatorPopupClose) {
	indicatorPopupClose.addEventListener('click', event => {
		event.stopPropagation();
		closeIndicatorPopup();
	});
}

document.addEventListener('click', event => {
	if (
		indicatorPopup &&
		indicatorPopup.style.display === 'block' &&
		!indicatorPopup.contains(event.target) &&
		// allow clicks on other toggle controls without immediately closing menus they open
		event.target !== indicatorPopup &&
		Date.now() - lastIndicatorPopupOpenedAt > POPUP_CLOSE_GRACE_MS
	) {
		closeIndicatorPopup();
	}
});

chart.on('mousemove', params => {
	if (!params) return;
	const name = params.seriesName;
	if (typeof name !== 'string') return;
	if (!indicatorPopupConfigsBySeries[name]) return;
	lastIndicatorSeriesName = name;
	lastIndicatorSeriesType = params.seriesType || null;
	lastIndicatorSeriesTime = Date.now();
});

chart.on('click', params => {
	const ev = params && params.event && (params.event.event || params.event);
	const now = Date.now();
	const clientX =
		ev && typeof ev.clientX === 'number'
			? ev.clientX
			: typeof ev.offsetX === 'number'
				? ev.offsetX
				: Number.NaN;
	const clientY =
		ev && typeof ev.clientY === 'number'
			? ev.clientY
			: typeof ev.offsetY === 'number'
				? ev.offsetY
				: Number.NaN;
	let seriesName =
		params && typeof params.seriesName === 'string' ? params.seriesName : null;
	let seriesType = params && params.seriesType ? params.seriesType : null;

	const timeDelta = now - lastChartClickTimestamp;
	const dx = clientX - lastChartClickX;
	const dy = clientY - lastChartClickY;
	const distanceSq = dx * dx + dy * dy;
	const distanceOk =
		Number.isFinite(distanceSq) &&
		distanceSq <= MANUAL_DOUBLECLICK_DISTANCE_PX * MANUAL_DOUBLECLICK_DISTANCE_PX;

	if (
		lastChartClickTimestamp !== 0 &&
		timeDelta <= MANUAL_DOUBLECLICK_INTERVAL_MS &&
		distanceOk
	) {
		// treat as manual double-click if ECharts didn't emit dblclick
		if (!seriesName && lastChartClickSeriesName) {
			seriesName = lastChartClickSeriesName;
			seriesType = lastChartClickSeriesType;
		}
		openIndicatorPopupForSeries(seriesName, seriesType, ev);
		lastChartClickTimestamp = 0;
		lastChartClickX = Number.NaN;
		lastChartClickY = Number.NaN;
		lastChartClickSeriesName = null;
		lastChartClickSeriesType = null;
		return;
	}

	lastChartClickTimestamp = now;
	lastChartClickX = clientX;
	lastChartClickY = clientY;
	lastChartClickSeriesName = seriesName;
	lastChartClickSeriesType = seriesType;
});

chart.on('dblclick', params => {
	let seriesName =
		params && typeof params.seriesName === 'string' ? params.seriesName : null;
	let seriesType = params && params.seriesType ? params.seriesType : null;
	const ev = params && params.event && (params.event.event || params.event);

	// If the dblclick event doesn't carry a usable series name, fall back to the
	// last hovered indicator series so the popup still targets the right thing.
	if (!seriesName && lastIndicatorSeriesName) {
		seriesName = lastIndicatorSeriesName;
		seriesType = lastIndicatorSeriesType;
	}

	openIndicatorPopupForSeries(seriesName, seriesType, ev);
});

if (zr) {
	zr.on('click', e => {
		handleCanvasClickForDouble(
			lastIndicatorSeriesName,
			lastIndicatorSeriesType,
			e && (e.event || e)
		);
	});
	zr.on('dblclick', e => {
		openIndicatorPopupForSeries(
			lastIndicatorSeriesName,
			lastIndicatorSeriesType,
			e && (e.event || e)
		);
	});
}

window.addEventListener('resize', () => {
	chart.resize();
});

render();

function startStream() {
	if (streamTimerId !== null) {
		return;
	}
	streamTimerId = setInterval(() => {
		const lastBar = baseData[baseData.length - 1];
		const next = generateNextRandomWalkCandle(lastBar);
		if (!next) {
			return;
		}
		baseData.push(next);
		if (baseData.length > MAX_HISTORY_BARS) {
			baseData = baseData.slice(baseData.length - MAX_HISTORY_BARS);
		}
		render();
	}, streamIntervalMs);
}

function stopStream() {
	if (streamTimerId !== null) {
		clearInterval(streamTimerId);
		streamTimerId = null;
	}
}

if (goLiveButton) {
	goLiveButton.addEventListener('click', () => {
		chart.dispatchAction({
			type: 'dataZoom',
			dataZoomIndex: 0,
			start: 0,
			end: 100,
		});
	});
}

let isStreaming = true;
startStream();

function applyPerfPreset(preset) {
	perfPreset = preset;
	switch (preset) {
		case 'light':
			perfPxPerBar = 8;
			perfMinBars = 150;
			streamIntervalMs = 1500;
			break;
		case 'heavy':
			perfPxPerBar = 4;
			perfMinBars = 250;
			streamIntervalMs = 700;
			break;
		case 'normal':
	default:
			perfPxPerBar = 6;
			perfMinBars = 200;
			streamIntervalMs = STREAM_INTERVAL_MS;
			break;
	}
	if (isStreaming) {
		stopStream();
		startStream();
	} else {
		render();
	}
}

if (streamToggle) {
	streamToggle.addEventListener('click', () => {
		if (isStreaming) {
			stopStream();
			isStreaming = false;
			streamToggle.classList.add('active');
			streamToggle.textContent = 'Resume';
		} else {
			startStream();
			isStreaming = true;
			streamToggle.classList.remove('active');
			streamToggle.textContent = 'Pause';
		}
	});
}
