export function mapToBase(base, points) {
	const baseLen = base.length;
	const ptsLen = points.length;
	if (!baseLen || !ptsLen) {
		return base.map(() => null);
	}
	const start = baseLen > ptsLen ? baseLen - ptsLen : 0;
	const out = new Array(baseLen);
	for (let i = 0; i < baseLen; i++) {
		const srcIndex = i - start;
		const p = srcIndex >= 0 && srcIndex < ptsLen ? points[srcIndex] : null;
		out[i] = p ? p.value : null;
	}
	return out;
}

export function mapHistToBase(base, hist) {
	const baseLen = base.length;
	const ptsLen = hist.length;
	if (!baseLen || !ptsLen) {
		return base.map(() => null);
	}
	const start = baseLen > ptsLen ? baseLen - ptsLen : 0;
	const out = new Array(baseLen);
	for (let i = 0; i < baseLen; i++) {
		const srcIndex = i - start;
		const p = srcIndex >= 0 && srcIndex < ptsLen ? hist[srcIndex] : null;
		out[i] = p
			? {
					value: p.value,
					itemStyle: { color: p.color },
			  }
			: null;
	}
	return out;
}

export function mapVolumeToBase(base, volumePoints) {
	let maxVol = 0;
	for (const p of volumePoints) {
		if (p.value > maxVol) maxVol = p.value;
	}
	if (!Number.isFinite(maxVol) || maxVol <= 0) maxVol = 1;
	const scale = 0.2;
	const baseLen = base.length;
	const ptsLen = volumePoints.length;
	if (!baseLen || !ptsLen) {
		return base.map(() => null);
	}
	const start = baseLen > ptsLen ? baseLen - ptsLen : 0;
	const out = new Array(baseLen);
	for (let i = 0; i < baseLen; i++) {
		const srcIndex = i - start;
		const p = srcIndex >= 0 && srcIndex < ptsLen ? volumePoints[srcIndex] : null;
		if (!p) {
			out[i] = null;
			continue;
		}
		const normalized = (p.value / maxVol) * scale;
		out[i] = {
			value: normalized,
			itemStyle: { color: p.color },
		};
	}
	return out;
}
