import * as echarts from 'echarts';
import { convertToLineData } from './sample-data';

const container = document.getElementById('chart');
if (!container) {
	throw new Error('Chart container #chart not found');
}

const chart = echarts.init(container, null, { renderer: 'canvas' });

function generateRandomWalkCandles({
	points = 7 * 365,
	startPrice = 1000,
	startDate = new Date(Date.UTC(2018, 0, 1)),
}) {
	const candles = [];
	let lastClose = startPrice;
	let volatility = 0.03; // daily vol baseline
	const dayMs = 24 * 60 * 60 * 1000;

	for (let i = 0; i < points; i++) {
		const date = new Date(startDate.getTime() + i * dayMs);

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

const baseData = generateRandomWalkCandles({});

const datasets = {
	'5m': baseData,
	'15m': baseData.filter((_, i) => i % 3 === 0),
	'1h': baseData.filter((_, i) => i % 12 === 0),
	'4h': baseData.filter((_, i) => i % 24 === 0),
	'1d': baseData.filter((_, i) => i % 48 === 0),
};

let timeframe = '5m';
let rangeKey = 'all';
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
const toggleMACD = document.getElementById('toggle-macd');
const togglePSAR = document.getElementById('toggle-psar');
const toggleKDJ = document.getElementById('toggle-kdj');
const toggleATR = document.getElementById('toggle-atr');
const toggleADX = document.getElementById('toggle-adx');
const logToggle = document.getElementById('log-toggle');
const bottomClock = document.getElementById('bottom-clock');
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
const settingEmaLengthInput = document.getElementById('setting-ema-length');
const settingEmaFastLengthInput = document.getElementById('setting-ema-fast-length');
const settingEmaSlowLengthInput = document.getElementById('setting-ema-slow-length');
const settingSmaLengthInput = document.getElementById('setting-sma-length');
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

const indicatorPopup = document.getElementById('indicator-popup');
const indicatorPopupTitle = document.getElementById('indicator-popup-title');
const indicatorPopupBody = document.getElementById('indicator-popup-body');
const indicatorPopupClose = document.getElementById('indicator-popup-close');

function getTimeframeData() {
	return datasets[timeframe] ?? baseData;
}

function applyRangeToData(data, key) {
	const len = data.length;
	if (!len) return [];
	if (key === 'all') return data.slice();
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
	return data.slice(fromIndex);
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

function mapToBase(base, points) {
	const byTime = new Map(points.map(p => [p.time, p]));
	return base.map(bar => {
		const p = byTime.get(bar.time);
		return p ? p.value : null;
	});
}

function mapHistToBase(base, hist) {
	const byTime = new Map(hist.map(p => [p.time, p]));
	return base.map(bar => {
		const p = byTime.get(bar.time);
		return p
			? {
					value: p.value,
					itemStyle: { color: p.color },
			  }
			: null;
	});
}

function mapVolumeToBase(base, volumePoints) {
	const byTime = new Map(volumePoints.map(p => [p.time, p]));
	let maxVol = 0;
	for (const p of volumePoints) {
		if (p.value > maxVol) maxVol = p.value;
	}
	if (!Number.isFinite(maxVol) || maxVol <= 0) maxVol = 1;
	const scale = 0.2; // max 20% of pane height
	return base.map(bar => {
		const p = byTime.get(bar.time);
		if (!p) return null;
		const normalized = (p.value / maxVol) * scale;
		return {
			value: normalized,
			itemStyle: { color: p.color },
		};
	});
}

function readPositiveNumber(input, fallback) {
	const raw =
		input && typeof input.value === 'string'
			? Number.parseFloat(input.value)
			: Number.NaN;
	const value = Math.round(raw);
	return Number.isFinite(value) && value > 0 ? value : fallback;
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
		atrLength: readPositiveNumber(settingAtrLengthInput, 14),
		adxLength: readPositiveNumber(settingAdxLengthInput, 14),
		macdFast: readPositiveNumber(settingMacdFastInput, 12),
		macdSlow: readPositiveNumber(settingMacdSlowInput, 26),
		macdSignal: readPositiveNumber(settingMacdSignalInput, 9),
		keltnerMaLength: readPositiveNumber(settingKeltnerMaLengthInput, 20),
		keltnerAtrLength: readPositiveNumber(settingKeltnerAtrLengthInput, 20),
		keltnerMult: readNonNegativeNumber(settingKeltnerMultInput, 1.5),
		ichConv: readPositiveNumber(settingIchConvInput, 9),
		ichBase: readPositiveNumber(settingIchBaseInput, 26),
		ichSpanB: readPositiveNumber(settingIchSpanBInput, 52),
		ichDisplacement: readPositiveNumber(settingIchDisplacementInput, 26),
		biasLength: readPositiveNumber(settingBiasLengthInput, 20),
		psarStep: readNonNegativeNumber(settingPsarStepInput, 0.02),
		psarMaxStep: readNonNegativeNumber(settingPsarMaxStepInput, 0.2),
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
	"Williams %R (14)": {
		title: 'Williams %R (14)',
		fields: [{ label: 'Length', input: settingWprLengthInput }],
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
};

let lastIndicatorSeriesName = null;
let lastIndicatorSeriesTime = 0;

function openIndicatorPopup(config, nativeEvent) {
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
	const data = applyRangeToData(raw, rangeKey);
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

	let priceMin = Number.POSITIVE_INFINITY;
	let priceMax = Number.NEGATIVE_INFINITY;
	for (const bar of data) {
		if (bar.low < priceMin) priceMin = bar.low;
		if (bar.high > priceMax) priceMax = bar.high;
	}
	if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
		priceMin = 0;
		priceMax = 1;
	}
	const paddedMin = priceMin * 0.97;
	const paddedMax = priceMax * 1.03;

	const indicatorSettings = getIndicatorSettings();
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
	const candleBarWidth = isOhlcMode ? 2 : undefined;
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
	const showWPR = toggleWPR?.checked ?? false;
	const showATR = toggleATR?.checked ?? false;
	const showADX = toggleADX?.checked ?? false;
	const showOBV = toggleOBV?.checked ?? false;
	const showMACD = toggleMACD?.checked ?? false;

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

	const oscCount = oscillatorGroups.length;

	const mainAxisType = isLogScale ? 'log' : 'value';
	const totalSpan = 96;
	const mainTopPct = 4;

	const grids = [];

	let mainH = totalSpan;
	if (oscCount === 0) {
		mainH = totalSpan;
		grids.push({
			left: 60,
			right: 80,
			top: `${mainTopPct}%`,
			height: `${mainH}%`,
		});
	} else {
		mainH = totalSpan * 0.55;
		const oscTotal = totalSpan - mainH;
		const laneH = oscCount > 0 ? oscTotal / oscCount : 0;
		let currentTop = mainTopPct;
		grids.push({
			left: 60,
			right: 80,
			top: `${currentTop}%`,
			height: `${mainH}%`,
		});
		currentTop += mainH;
		for (let i = 0; i < oscCount; i++) {
			grids.push({
				left: 60,
				right: 80,
				top: `${currentTop}%`,
				height: `${laneH}%`,
			});
			currentTop += laneH;
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
		{
			type: mainAxisType,
			gridIndex: 0,
			scale: true,
			min: 'dataMin',
			max: 'dataMax',
			axisLine: { lineStyle: { color: 'rgba(148,163,184,0.6)' } },
			axisLabel: { color: '#9ca3af' },
			splitLine: { lineStyle: { color: 'rgba(30,64,175,0.35)' } },
		},
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
				data: showCandles ? (isHeikinMode ? heikinValues : candleValues) : [],
				itemStyle: candleItemStyle,
				barWidth: candleBarWidth,
			},
			{
				name: 'EMA 50',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showEMA ? emaSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#38bdf8', width: 2 },
			},
			{
				name: 'EMA 20',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showEMAFast ? emaFastSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#4ade80', width: 1.5 },
			},
			{
				name: 'EMA 100',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showEMASlow ? emaSlowSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#6366f1', width: 1.5 },
			},
			{
				name: 'SMA 20',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showSMA ? smaSeriesData : [],
				showSymbol: false,
				lineStyle: { color: '#a3e635', width: 2 },
			},
			{
				name: 'BB Upper',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showBB ? bbUpper : [],
				showSymbol: false,
				lineStyle: { color: '#22c55e', width: 1.5 },
			},
			{
				name: 'BB Lower',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showBB ? bbLower : [],
				showSymbol: false,
				lineStyle: { color: '#ef4444', width: 1.5 },
			},
			{
				name: 'BB Basis',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showBB ? bbBasis : [],
				showSymbol: false,
				lineStyle: { color: '#e5e7eb', width: 1, type: 'dashed' },
			},
			{
				name: 'Keltner Upper',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showKeltner ? keltnerUpperData : [],
				showSymbol: false,
				lineStyle: { color: '#facc15', width: 1.3 },
			},
			{
				name: 'Keltner Lower',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showKeltner ? keltnerLowerData : [],
				showSymbol: false,
				lineStyle: { color: '#fb7185', width: 1.3 },
			},
			{
				name: 'Keltner Basis',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showKeltner ? keltnerBasisData : [],
				showSymbol: false,
				lineStyle: { color: '#e5e7eb', width: 1, type: 'dotted' },
			},
			{
				name: 'Ichimoku Tenkan',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showIchimoku ? ichTenkanData : [],
				showSymbol: false,
				lineStyle: { color: '#f97316', width: 1.2 },
			},
			{
				name: 'Ichimoku Kijun',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showIchimoku ? ichKijunData : [],
				showSymbol: false,
				lineStyle: { color: '#22d3ee', width: 1.2 },
			},
			{
				name: 'Ichimoku Span A',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showIchimoku ? ichSpanAData : [],
				showSymbol: false,
				lineStyle: { color: 'rgba(34,197,94,0.8)', width: 1 },
				areaStyle: { color: 'rgba(34,197,94,0.12)' },
			},
			{
				name: 'Ichimoku Span B',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showIchimoku ? ichSpanBData : [],
				showSymbol: false,
				lineStyle: { color: 'rgba(239,68,68,0.8)', width: 1 },
				areaStyle: { color: 'rgba(239,68,68,0.12)' },
			},
			{
				name: 'Ichimoku Chikou',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showIchimoku ? ichChikouData : [],
				showSymbol: false,
				lineStyle: { color: '#a855f7', width: 1 },
			},
			{
				name: 'VWAP',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showVWAP ? vwapData : [],
				showSymbol: false,
				lineStyle: { color: '#a855f7', width: 1.8 },
			},
			{
				name: 'Parabolic SAR',
				type: 'scatter',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showPSAR ? psarData : [],
				symbolSize: 5,
				itemStyle: { color: '#facc15' },
			},
			{
				name: 'Donchian Upper',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showDonchian ? donchUpperData : [],
				showSymbol: false,
				lineStyle: { color: '#f97316', width: 1.2 },
			},
			{
				name: 'Donchian Lower',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showDonchian ? donchLowerData : [],
				showSymbol: false,
				lineStyle: { color: '#0ea5e9', width: 1.2 },
			},
			{
				name: 'Donchian Mid',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showDonchian ? donchMidData : [],
				showSymbol: false,
				lineStyle: { color: '#e5e7eb', width: 1, type: 'dotted' },
			},
			{
				name: 'Price Line',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showPriceLine ? priceLineData : [],
				showSymbol: false,
				lineStyle: { color: '#fbbf24', width: 1.5 },
			},
			{
				name: 'Price Area',
				type: 'line',
				xAxisIndex: 0,
				yAxisIndex: 0,
				data: showPriceArea ? priceLineData : [],
				showSymbol: false,
				lineStyle: { width: 0 },
				areaStyle: { color: 'rgba(59,130,246,0.35)' },
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

	return {
		backgroundColor: '#020617',
		animation: false,
		grid: grids,
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'cross' },
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
}

function render() {
	const option = buildOption();
	chart.setOption(option, true);
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
			mode === 'heikin'
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
	].forEach(el => {
	el?.addEventListener('change', render);
});

const settingsInputs = [
	settingEmaLengthInput,
	settingEmaFastLengthInput,
	settingEmaSlowLengthInput,
	settingSmaLengthInput,
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
	settingAtrLengthInput,
	settingAdxLengthInput,
	settingMacdFastInput,
	settingMacdSlowInput,
	settingMacdSignalInput,
	settingKeltnerMaLengthInput,
	settingKeltnerAtrLengthInput,
	settingKeltnerMultInput,
	settingIchConvInput,
	settingIchBaseInput,
	settingIchSpanBInput,
	settingIchDisplacementInput,
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
		event.target !== indicatorPopup
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
	lastIndicatorSeriesTime = Date.now();
});

chart.on('dblclick', params => {
	let seriesName = params && params.seriesName;
	let config = seriesName ? indicatorPopupConfigsBySeries[seriesName] : undefined;
	const ev = params && params.event && (params.event.event || params.event);
	if (!config) {
		const now = Date.now();
		if (
			(!seriesName || seriesName === 'Price' || !indicatorPopupConfigsBySeries[seriesName]) &&
			lastIndicatorSeriesName &&
			indicatorPopupConfigsBySeries[lastIndicatorSeriesName] &&
			now - lastIndicatorSeriesTime < 600
		) {
			seriesName = lastIndicatorSeriesName;
			config = indicatorPopupConfigsBySeries[lastIndicatorSeriesName];
		}
	}
	if (config) {
		if (ev && typeof ev.stopPropagation === 'function') {
			ev.stopPropagation();
		}
		closeSettingsPanel();
		openIndicatorPopup(config, ev);
	} else {
		closeIndicatorPopup();
		openSettingsPanel();
	}
});

window.addEventListener('resize', () => {
	chart.resize();
});

render();
