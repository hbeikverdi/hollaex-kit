import math from 'mathjs';
import { createSelector } from 'reselect';
import { getDecimals } from 'utils/utils';
import { formatPercentage } from 'utils/currency';
import { BASE_CURRENCY, DEFAULT_COIN_DATA } from 'config/constants';

export const subtract = (a = 0, b = 0) => {
	const remaining = math.chain(a).subtract(b).done();
	return remaining;
};

const sumQuantities = (orders) =>
	orders.reduce((total, [, size]) => total + size, 0);

const sumOrderTotal = (orders) =>
	orders.reduce(
		(total, [price, size]) =>
			total + math.multiply(math.fraction(size), math.fraction(price)),
		0
	);

const calcMaxCumulative = (askOrders, bidOrders) => {
	const totalAsks = sumQuantities(askOrders);
	const totalBids = sumQuantities(bidOrders);
	return Math.max(totalAsks, totalBids);
};

const pushCumulativeAmounts = (orders) => {
	let cumulative = 0;
	let cumulativePrice = 0;
	return orders.map((order) => {
		const [price, size] = order;
		cumulative += size;
		cumulativePrice += math.multiply(math.fraction(size), math.fraction(price));
		return [...order, cumulative, cumulativePrice];
	});
};

const round = (number, depth) => {
	const precision = getDecimals(depth);
	let result = math
		.chain(number)
		.divide(depth)
		.round()
		.multiply(depth)
		.round(precision)
		.done();

	// this is to prevent setting the price to 0
	if (!result) {
		result = math
			.chain(number)
			.divide(depth)
			.ceil()
			.multiply(depth)
			.round(precision)
			.done();
	}

	return result;
};

const calculateOrders = (orders, depth) =>
	orders.reduce((result, [price, size]) => {
		const lastIndex = result.length - 1;
		const [lastPrice, lastSize] = result[lastIndex] || [];

		if (lastPrice && math.equal(round(price, depth), lastPrice)) {
			result[lastIndex] = [lastPrice, lastSize + size];
		} else {
			result.push([round(price, depth), size]);
		}

		return result;
	}, []);

const getPairsOrderBook = (state) => state.orderbook.pairsOrderbooks;
const getQuickTradeOrderBook = (state) => state.quickTrade.pairsOrderbooks;
const getPair = (state) => state.app.pair;
const getOrderBookLevels = (state) =>
	state.user.settings.interface.order_book_levels;
const getPairsTrades = (state) => state.orderbook.pairsTrades;
const getActiveOrders = (state) => state.order.activeOrders;
const getUserTradesData = (state) => state.wallet.trades.data;
const getPairs = (state) => state.app.pairs;
const getDepth = (state) => state.orderbook.depth;
const getChartClose = (state) => state.orderbook.chart_last_close;
const getTickers = (state) => state.app.tickers;
const getCoins = (state) => state.app.coins;

export const orderbookSelector = createSelector(
	[getPairsOrderBook, getPair, getOrderBookLevels, getPairs, getDepth],
	(pairsOrders, pair, level, pairs, depthLevel = 1) => {
		const { increment_price = 1 } = pairs[pair] || {};
		const { asks: rawAsks = [], bids: rawBids = [] } = pairsOrders[pair] || {};

		const depth = math.multiply(depthLevel, increment_price);
		const calculatedAsks = calculateOrders(rawAsks, depth);
		const calculatedBids = calculateOrders(rawBids, depth);

		const filteredAsks = calculatedAsks.filter((ask, index) => index < level);
		const filteredBids = calculatedBids.filter((bid, index) => index < level);

		const maxCumulative = calcMaxCumulative(filteredAsks, filteredBids);
		const asks = pushCumulativeAmounts(filteredAsks);
		const bids = pushCumulativeAmounts(filteredBids);

		return { maxCumulative, asks, bids };
	}
);

export const depthChartSelector = createSelector(
	[orderbookSelector],
	({ asks: fullAsks, bids: fullBids }) => {
		const asks = fullAsks.map(([orderPrice, , accSize]) => [
			orderPrice,
			accSize,
		]);
		const bids = fullBids.map(([orderPrice, , accSize]) => [
			orderPrice,
			accSize,
		]);
		return [
			{
				name: 'Asks',
				data: asks,
				className: 'depth-chart__asks',
				marker: {
					enabled: false,
				},
			},
			{
				name: 'Bids',
				data: bids,
				className: 'depth-chart__bids',
				marker: {
					enabled: false,
				},
			},
		];
	}
);

export const tradeHistorySelector = createSelector(
	getPairsTrades,
	getPair,
	(pairsTrades, pair) => {
		const data = pairsTrades[pair] || [];
		const sizeArray = data.map(({ size }) => size);
		const maxAmount = Math.max(...sizeArray);
		return { data, maxAmount };
	}
);

export const marketPriceSelector = createSelector(
	[tradeHistorySelector, getChartClose],
	({ data: tradeHistory }, chartCloseValue) => {
		const marketPrice =
			tradeHistory && tradeHistory.length > 0
				? tradeHistory[0].price
				: chartCloseValue;
		return marketPrice;
	}
);

export const activeOrdersSelector = createSelector(
	getActiveOrders,
	getPair,
	(orders, pair) => {
		let count = 0;
		return orders.filter(({ symbol }) => symbol === pair && count++ < 50);
	}
);

export const userTradesSelector = createSelector(
	getUserTradesData,
	getPair,
	(trades, pair) => {
		let count = 0;
		const filtered = trades.filter(
			({ symbol }) => symbol === pair && count++ < 10
		);
		return filtered;
	}
);

const getSide = (_, { side }) => side;
const getSize = (_, { size }) => (!!size ? size : 0);
const getFirstAssetCheck = (_, { isFirstAsset }) => isFirstAsset;

const calculateMarketPrice = (orderSize = 0, orders = []) =>
	orders.reduce(
		([accumulatedPrice, accumulatedSize], [price = 0, size = 0]) => {
			if (math.larger(orderSize, accumulatedSize)) {
				const remainingSize = math.subtract(orderSize, accumulatedSize);
				if (math.largerEq(remainingSize, size)) {
					return [
						math.sum(accumulatedPrice, math.multiply(size, price)),
						math.sum(accumulatedSize, size),
					];
				} else {
					return [
						math.sum(accumulatedPrice, math.multiply(remainingSize, price)),
						math.sum(accumulatedSize, remainingSize),
					];
				}
			} else {
				return [accumulatedPrice, accumulatedSize];
			}
		},
		[0, 0]
	);

const calculateMarketPriceByTotal = (orderSize = 0, orders = []) =>
	orders.reduce(
		([accumulatedPrice, accumulatedSize], [price = 0, size = 0]) => {
			if (math.larger(orderSize, accumulatedPrice)) {
				let currentTotal = math.multiply(size, price);
				const remainingSize = math.subtract(orderSize, accumulatedPrice);
				if (math.largerEq(remainingSize, currentTotal)) {
					return [
						math.sum(accumulatedPrice, currentTotal),
						math.sum(accumulatedSize, size),
					];
				} else {
					let remainingBaseSize = math.divide(remainingSize, price);
					return [
						math.sum(accumulatedPrice, math.multiply(remainingBaseSize, price)),
						math.sum(accumulatedSize, remainingBaseSize),
					];
				}
			} else {
				return [accumulatedPrice, accumulatedSize];
			}
		},
		[0, 0]
	);

export const estimatedMarketPriceSelector = createSelector(
	[getPairsOrderBook, getPair, getSide, getSize],
	(pairsOrders, pair, side, size) => {
		const { [side === 'buy' ? 'asks' : 'bids']: orders = [] } =
			pairsOrders[pair] || {};
		const totalOrders = sumQuantities(orders);
		if (math.larger(size, totalOrders)) {
			return [0, size];
		} else {
			return calculateMarketPrice(size, orders);
		}
	}
);

export const estimatedQuickTradePriceSelector = createSelector(
	[getQuickTradeOrderBook, getPair, getSide, getSize, getFirstAssetCheck],
	(pairsOrders, pair, side, size, isFirstAsset) => {
		const { [side === 'buy' ? 'asks' : 'bids']: orders = [] } =
			pairsOrders[pair] || {};
		let totalOrders = sumQuantities(orders);
		if (!isFirstAsset) {
			totalOrders = sumOrderTotal(orders);
		}
		if (math.larger(size, totalOrders)) {
			return [0, size];
		} else if (!isFirstAsset) {
			const [priceValue, sizeValue] = calculateMarketPriceByTotal(size, orders);
			return [priceValue / sizeValue, sizeValue];
		} else {
			const [priceValue, sizeValue] = calculateMarketPrice(size, orders);
			return [priceValue / sizeValue, sizeValue];
		}
	}
);

export const sortedPairKeysSelector = createSelector(
	[getPairs, getTickers],
	(pairs, tickers) => {
		const sortedPairKeys = Object.keys(pairs).sort((a, b) => {
			const { volume: volumeA = 0, close: closeA = 0 } = tickers[a] || {};
			const { volume: volumeB = 0, close: closeB = 0 } = tickers[b] || {};
			const marketCapA = math.multiply(volumeA, closeA);
			const marketCapB = math.multiply(volumeB, closeB);
			return marketCapB - marketCapA;
		});
		return sortedPairKeys;
	}
);

export const MarketsSelector = createSelector(
	[sortedPairKeysSelector, getPairs, getTickers, getCoins],
	(sortedPairKeys, pairs, tickers, coins) => {
		const markets = sortedPairKeys.map((key) => {
			const { pair_base, pair_2, increment_price } = pairs[key] || {};
			const { fullname, symbol = '' } =
				coins[pair_base || BASE_CURRENCY] || DEFAULT_COIN_DATA;
			const pairTwo = coins[pair_2] || DEFAULT_COIN_DATA;
			const { open, close } = tickers[key] || {};

			const priceDifference = open === 0 ? 0 : (close || 0) - (open || 0);

			const tickerPercent =
				priceDifference === 0 || open === 0
					? 0
					: (priceDifference / open) * 100;

			const priceDifferencePercent = isNaN(tickerPercent)
				? formatPercentage(0)
				: formatPercentage(tickerPercent);
			return {
				key,
				pair: pairs[key],
				symbol,
				pairTwo,
				fullname,
				ticker: tickers[key],
				increment_price,
				priceDifference,
				priceDifferencePercent,
			};
		});

		return markets;
	}
);
