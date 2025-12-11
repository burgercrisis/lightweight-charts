export function estimateAtrRange(candles, length) {
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

export function estimateDefaultRangeSize(data, timeframe) {
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

export function buildRangeBars(data, rangeSize, timeframe) {
	const len = data.length;
	if (!len) return [];
	const baseline = estimateDefaultRangeSize(data, timeframe);
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

export function buildRenkoBricks(data, boxSize, timeframe) {
	const len = data.length;
	if (!len) return [];
	let effectiveBoxSize =
		typeof boxSize === 'number' && boxSize > 0
			? boxSize
			: estimateDefaultRangeSize(data, timeframe);
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
	let lastDirection = 0;
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

export function buildKagiLines(data, reversalSize, timeframe) {
	const len = data.length;
	if (!len) return [];
	let effectiveReversal =
		typeof reversalSize === 'number' && reversalSize > 0
			? reversalSize
			: estimateDefaultRangeSize(data, timeframe);
	if (!Number.isFinite(effectiveReversal) || effectiveReversal <= 0) {
		return data.slice();
	}
	const lines = [];
	let lastPrice = data[0]?.close;
	if (typeof lastPrice !== 'number') {
		return data.slice();
	}
	let direction = 0;
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
