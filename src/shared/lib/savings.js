export const EMPTY_SAVINGS_SUMMARY = {
	totalBank: 0,
	totalCurrencies: [],
	monthlyTotals: [],
	categoryTotals: [],
	transfers: [],
};

const MONTH_NAMES = [
	"Январь",
	"Февраль",
	"Март",
	"Апрель",
	"Май",
	"Июнь",
	"Июль",
	"Август",
	"Сентябрь",
	"Октябрь",
	"Ноябрь",
	"Декабрь",
];

function getSavingsCategoryName(transfer) {
	const name = String(transfer?.category?.name || "").trim();
	return name || "Без категории";
}

function createSavingsTotal(extra = {}) {
	return {
		amount: 0,
		transfersCount: 0,
		currencies: new Map(),
		...extra,
	};
}

function addSavingsAmount(total, transfer) {
	const amount = Number(transfer?.amount) || 0;
	const currencyCode = transfer?.currencyCode || "RUB";

	total.amount += amount;
	total.transfersCount += 1;
	total.currencies.set(
		currencyCode,
		(total.currencies.get(currencyCode) || 0) + amount
	);
}

function serializeSavingsTotal(total) {
	const currencies = Array.from(total.currencies.entries()).map(
		([currencyCode, amount]) => ({ currencyCode, amount })
	);

	return {
		...total,
		currencyCode: currencies.length === 1 ? currencies[0].currencyCode : null,
		currencies,
	};
}

function sortSavingsMonths(a, b) {
	if (b.year !== a.year) return b.year - a.year;
	return b.month - a.month;
}

export function buildSavingsCategoryTotals(transfers) {
	const totalsByName = new Map();

	for (const transfer of transfers || []) {
		const name = getSavingsCategoryName(transfer);
		const year = Number(transfer?.year) || 0;
		const month = Number(transfer?.month) || 0;
		const monthKey = `${year}-${month}`;
		let total = totalsByName.get(name);

		if (!total) {
			total = createSavingsTotal({
				name,
				months: new Map(),
			});
			totalsByName.set(name, total);
		}

		let monthTotal = total.months.get(monthKey);
		if (!monthTotal) {
			monthTotal = createSavingsTotal({ year, month });
			total.months.set(monthKey, monthTotal);
		}

		addSavingsAmount(total, transfer);
		addSavingsAmount(monthTotal, transfer);
	}

	return Array.from(totalsByName.values())
		.map((total) => {
			const months = Array.from(total.months.values())
				.map(serializeSavingsTotal)
				.sort(sortSavingsMonths);

			return {
				...serializeSavingsTotal(total),
				months,
			};
		})
		.sort((a, b) => {
			if (b.amount !== a.amount) return b.amount - a.amount;
			return a.name.localeCompare(b.name, "ru");
		});
}

export function buildSavingsCurrencyTotals(transfers) {
	const totalsByCurrency = new Map();

	for (const transfer of transfers || []) {
		const currencyCode = transfer?.currencyCode || "RUB";
		totalsByCurrency.set(
			currencyCode,
			(totalsByCurrency.get(currencyCode) || 0) +
				(Number(transfer?.amount) || 0)
		);
	}

	return Array.from(totalsByCurrency.entries()).map(
		([currencyCode, amount]) => ({ currencyCode, amount })
	);
}

export function buildSavingsMonthlyTotals(transfers) {
	const totalsByMonth = new Map();

	for (const transfer of transfers || []) {
		const year = Number(transfer?.year) || 0;
		const month = Number(transfer?.month) || 0;
		const key = `${year}-${month}`;
		let total = totalsByMonth.get(key);

		if (!total) {
			total = createSavingsTotal({ year, month });
			totalsByMonth.set(key, total);
		}

		addSavingsAmount(total, transfer);
	}

	return Array.from(totalsByMonth.values())
		.map(serializeSavingsTotal)
		.sort(sortSavingsMonths);
}

export function hasMonthlyCategoryTotals(categoryTotals) {
	return (
		Array.isArray(categoryTotals) &&
		categoryTotals.every((row) => Array.isArray(row.months))
	);
}

export function formatSavingsMonthLabel(row) {
	const month = Number(row?.month) || 0;
	const year = Number(row?.year) || 0;
	const monthName = MONTH_NAMES[month - 1] || `Месяц ${month}`;

	return year ? `${monthName} ${year}` : monthName;
}
