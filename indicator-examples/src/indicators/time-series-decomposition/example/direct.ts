import {
	ChartOptions,
	DeepPartial,
	LineSeries,
	createChart,
} from 'lightweight-charts';
import { generateLineData } from '../../../sample-data';
import {
	computeDecomposition,
	DecompositionConfig,
} from '../time-series-decomposition-calculation';

const chartOptions = {
	autoSize: true,
} satisfies DeepPartial<ChartOptions>;

const priceChart = createChart('chart', chartOptions);
const oscChart = createChart('chart-osc', chartOptions);

const lineData = generateLineData(500, new Date(Date.UTC(2020, 0, 1)));

const priceSeries = priceChart.addSeries(LineSeries, {});
priceSeries.setData(lineData.map(d => ({ time: d.time, value: d.value })));

const config: DecompositionConfig = {
	trendLength: 50,
	seasonLength: 50,
	seasonSmoothing: 1,
	residualStdWindow: 100,
	standardizeResiduals: true,
	model: 'additive',
	normalizeSeasonality: true,
};

const { trend, seasonal, residual } = computeDecomposition(lineData, config);

const trendSeries = priceChart.addSeries(LineSeries, {
	color: 'orange',
	lineWidth: 2,
});
trendSeries.setData(trend);

const seasonalSeries = oscChart.addSeries(LineSeries, {
	color: 'green',
});
seasonalSeries.setData(seasonal);

const residualSeries = oscChart.addSeries(LineSeries, {
	color: 'red',
});
residualSeries.setData(residual);

priceChart.timeScale().fitContent();
oscChart.timeScale().fitContent();
