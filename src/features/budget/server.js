"use server";

import { prisma } from "@/shared/db";
import { requireUserId } from "@/shared/auth/session";
import {
	buildSavingsCategoryTotals,
	buildSavingsCurrencyTotals,
	buildSavingsMonthlyTotals,
} from "@/shared/lib/savings";

// Helpers
export async function upsertUser() {
	// ensure user exists based on session
	const userId = await requireUserId();
	const user = await prisma.user.upsert({
		where: { id: userId },
		update: {},
		create: { id: userId },
	});
	return user;
}

// Проверка доступа к бюджету владельца. Возвращает ownerId.
export async function ensureAccess(ownerId) {
	const meId = await requireUserId();
	if (!ownerId || ownerId === meId) return meId;
	const share = await prisma.budgetShare.findFirst({
		where: { ownerId, memberId: meId },
		select: { id: true },
	});
	if (!share) {
		const err = new Error("Forbidden");
		err.status = 403;
		throw err;
	}
	return ownerId;
}

export async function getOrCreateBudget(year, month, ownerId) {
	const userId = await ensureAccess(ownerId);
	// Ensure user exists in database
	await prisma.user.upsert({
		where: { id: userId },
		update: {},
		create: { id: userId },
	});
	const defaults = [
		{
			name: "Обязательные траты (еда/дом/товары)",
			amount: 0,
			sortOrder: 0,
		},
		{ name: "Cafe/Wolt", amount: 0, sortOrder: 1 },
		{
			name: "Личные расходы (одежда/гаджеты/медицина)",
			amount: 0,
			sortOrder: 2,
		},
		{ name: "Путешествия", amount: 0, sortOrder: 3 },
		{ name: "Аренда", amount: 0, sortOrder: 4 },
		{ name: "Инвестиции", amount: 0, sortOrder: 5 },
	];
	const result = await prisma.budget.upsert({
		where: {
			userId_month_year: { userId, month, year },
		},
		update: {},
		create: {
			month,
			year,
			income: 0,
			userId,
			currencyCode: "RUB",
			categories: { create: defaults },
		},
		include: { categories: true, expenses: true },
	});
	return result;
}

export async function setIncome({ year, month, income, ownerId }) {
	const b = await getOrCreateBudget(year, month, ownerId);
	return prisma.budget.update({
		where: { id: b.id },
		data: { income: Math.max(0, Math.floor(income)) },
	});
}

function getCategoryDisplayName(category) {
	const name = String(category?.name || "").trim();
	return name || "Без категории";
}

function addAmountByCategoryName(totalsByName, category, amount) {
	const name = getCategoryDisplayName(category);
	totalsByName.set(name, (totalsByName.get(name) || 0) + amount);
}

// Рассчитать и записать пополнения и списания накоплений за месяц
export async function calculateAndUpsertSavings(year, month, ownerId) {
	const userId = await ensureAccess(ownerId);
	const budget = await prisma.budget.findUnique({
		where: { userId_month_year: { userId, month, year } },
		include: { categories: true, expenses: true },
	});
	if (!budget) return [];
	const spentByCat = new Map();
	for (const e of budget.expenses) {
		spentByCat.set(
			e.categoryId,
			(spentByCat.get(e.categoryId) || 0) + e.amount
		);
	}
	// Считаем базовые накопления и переносы
	const baseAmounts = new Map(); // categoryId -> amount
	const rolloverAdds = new Map(); // targetCategoryId -> addition

	for (const c of budget.categories) {
		const allocated = Math.max(0, Number(c.amount) || 0);
		const spent = spentByCat.get(c.id) || 0;
		const leftover = Math.max(0, allocated - spent);
		if (c.isSaving) {
			// В накопления отправляем сумму расходов
			baseAmounts.set(c.id, spent);
		}
		// перенос остатков только если категория сама не копящая
		if (!c.isSaving && c.rolloverEnabled && c.rolloverTargetId) {
			// убедимся, что цель существует в этом бюджете и является копящей
			const target = budget.categories.find(
				(x) => x.id === c.rolloverTargetId
			);
			if (target && target.isSaving && target.id !== c.id) {
				rolloverAdds.set(
					target.id,
					(rolloverAdds.get(target.id) || 0) + leftover
				);
			}
		}
	}

	// Формируем финальные суммы на запись
	const finalAmounts = new Map();
	for (const [k, v] of baseAmounts) finalAmounts.set(k, v);
	for (const [k, v] of rolloverAdds)
		finalAmounts.set(k, (finalAmounts.get(k) || 0) + v);

	const budgetCurrencyCode = budget.currencyCode || "RUB";
	const existingTransfers = await prisma.savingsTransfer.findMany({
		where: {
			userId,
			NOT: { year, month },
		},
		include: { category: true },
	});
	const availableSavingsByName = new Map();
	for (const transfer of existingTransfers) {
		if ((transfer.currencyCode || budgetCurrencyCode) !== budgetCurrencyCode)
			continue;

		addAmountByCategoryName(
			availableSavingsByName,
			transfer.category,
			Number(transfer.amount) || 0
		);
	}
	for (const c of budget.categories) {
		if (c.isSaving) continue;

		const allocated = Math.max(0, Number(c.amount) || 0);
		const spent = spentByCat.get(c.id) || 0;
		const overspent = Math.max(0, spent - allocated);
		if (!overspent) continue;

		const availableSavings =
			availableSavingsByName.get(getCategoryDisplayName(c)) || 0;
		if (availableSavings <= 0) continue;

		finalAmounts.set(c.id, (finalAmounts.get(c.id) || 0) - overspent);
	}

	// Удаляем все записи по категориям, которых нет в finalAmounts
	const keepIds = Array.from(finalAmounts.keys());
	if (keepIds.length === 0) {
		await prisma.savingsTransfer.deleteMany({
			where: { userId, year, month },
		});
	} else {
		await prisma.savingsTransfer.deleteMany({
			where: {
				userId,
				year,
				month,
				categoryId: { notIn: keepIds },
			},
		});
	}

	// Обновляем/создаём записи
	const results = [];
	for (const [categoryId, amount] of finalAmounts.entries()) {
		const rec = await prisma.savingsTransfer.upsert({
			where: {
				userId_year_month_categoryId: {
					userId,
					year,
					month,
					categoryId,
				},
			},
			update: { amount, currencyCode: budget.currencyCode },
			create: {
				userId,
				year,
				month,
				categoryId,
				amount,
				currencyCode: budget.currencyCode,
			},
		});
		results.push(rec);
	}
	return results;
}

// Сохраняет статистику бюджета за месяц
export async function saveMonthlyStats(year, month, ownerId) {
	const userId = await ensureAccess(ownerId);
	const budget = await prisma.budget.findUnique({
		where: { userId_month_year: { userId, month, year } },
		include: { expenses: true },
	});
	if (!budget) return null;
	const totalExpenses = budget.expenses.reduce((sum, e) => sum + e.amount, 0);
	const stats = await prisma.monthlyBudgetStats.upsert({
		where: { userId_month_year: { userId, month, year } },
		update: {
			totalIncome: budget.income,
			totalExpenses,
			currencyCode: budget.currencyCode,
		},
		create: {
			userId,
			month,
			year,
			totalIncome: budget.income,
			totalExpenses,
			currencyCode: budget.currencyCode,
		},
	});
	await calculateAndUpsertSavings(year, month, ownerId);
	return stats;
}

// Получить статистику по всем месяцам
export async function getMonthlyStats(ownerId) {
	const userId = await ensureAccess(ownerId);
	return prisma.monthlyBudgetStats.findMany({
		where: { userId },
		orderBy: [{ year: "desc" }, { month: "desc" }],
	});
}

export async function addCategory({ year, month, name, amount, ownerId }) {
	const b = await getOrCreateBudget(year, month, ownerId);
	const a = Math.max(0, Math.floor(Number(amount) || 0));
	// суммируем текущие суммы категорий
	const existing = await prisma.category.findMany({
		where: { budgetId: b.id },
		select: { amount: true, sortOrder: true },
	});
	const total = existing.reduce((s, c) => s + (Number(c.amount) || 0), 0);
	if (total + a > b.income) {
		const err = new Error("Сумма по категориям не может превышать доход");
		err.status = 400;
		throw err;
	}
	// Находим максимальный sortOrder и добавляем 1
	const maxSortOrder =
		existing.length > 0
			? Math.max(...existing.map((c) => c.sortOrder || 0))
			: -1;
	await prisma.category.create({
		data: { name, amount: a, budgetId: b.id, sortOrder: maxSortOrder + 1 },
	});
}

export async function removeCategory({ year, month, categoryId, ownerId }) {
	await getOrCreateBudget(year, month, ownerId);
	await prisma.expense.deleteMany({ where: { categoryId } });
	await prisma.savingsTransfer.deleteMany({ where: { categoryId } });
	await prisma.category.delete({ where: { id: categoryId } });
}

export async function setCategoryName({
	year,
	month,
	categoryId,
	name,
	ownerId,
}) {
	await getOrCreateBudget(year, month, ownerId);
	if (!name || !name.trim()) {
		const err = new Error("Название категории не может быть пустым");
		err.status = 400;
		throw err;
	}
	await prisma.category.update({
		where: { id: categoryId },
		data: { name: name.trim() },
	});
}

export async function setCategoryAmount({
	year,
	month,
	categoryId,
	amount,
	ownerId,
}) {
	await getOrCreateBudget(year, month, ownerId);
	const current = await prisma.category.findUnique({
		where: { id: categoryId },
		select: { id: true, budgetId: true, amount: true },
	});
	if (!current) return;
	const newAmount = Math.max(0, Math.floor(Number(amount) || 0));
	// сумма по остальным категориям этого бюджета
	const others = await prisma.category.findMany({
		where: { budgetId: current.budgetId, id: { not: categoryId } },
		select: { amount: true },
	});
	const othersSum = others.reduce((s, c) => s + (Number(c.amount) || 0), 0);
	const b = await prisma.budget.findFirst({
		where: { id: current.budgetId },
	});
	if (!b) return;
	if (othersSum + newAmount > b.income) {
		const err = new Error("Сумма по категориям не может превышать доход");
		err.status = 400;
		throw err;
	}
	await prisma.category.update({
		where: { id: categoryId },
		data: { amount: newAmount },
	});
}

export async function setCategorySaving({
	year,
	month,
	categoryId,
	isSaving,
	ownerId,
}) {
	await getOrCreateBudget(year, month, ownerId);
	await prisma.category.update({
		where: { id: categoryId },
		data: { isSaving: !!isSaving },
	});
}

export async function setCategoryRollover({
	year,
	month,
	categoryId,
	rolloverEnabled,
	rolloverTargetId,
	ownerId,
}) {
	await getOrCreateBudget(year, month, ownerId);
	const src = await prisma.category.findUnique({
		where: { id: categoryId },
		select: { id: true, budgetId: true },
	});
	if (!src) return;
	if (!rolloverEnabled) {
		await prisma.category.update({
			where: { id: categoryId },
			data: { rolloverEnabled: false, rolloverTargetId: null },
		});
		return;
	}
	// если цель не указана, просто включаем перенос без цели
	if (!rolloverTargetId) {
		await prisma.category.update({
			where: { id: categoryId },
			data: { rolloverEnabled: true, rolloverTargetId: null },
		});
		return;
	}
	// validate target
	const target = await prisma.category.findUnique({
		where: { id: rolloverTargetId },
		select: { id: true, budgetId: true, isSaving: true },
	});
	if (
		!target ||
		target.budgetId !== src.budgetId ||
		!target.isSaving ||
		target.id === src.id
	) {
		const err = new Error(
			"Неверная целевая категория для переноса (должна быть копящей в том же бюджете)"
		);
		err.status = 400;
		throw err;
	}
	await prisma.category.update({
		where: { id: categoryId },
		data: { rolloverEnabled: true, rolloverTargetId: target.id },
	});
}

export async function addExpense({
	year,
	month,
	categoryId,
	amount,
	note,
	ownerId,
}) {
	const b = await getOrCreateBudget(year, month, ownerId);
	await prisma.expense.create({
		data: {
			amount: Math.max(0, Math.floor(amount)),
			note,
			categoryId,
			budgetId: b.id,
		},
	});
}

export async function subtractExpense({
	year,
	month,
	categoryId,
	amount,
	note,
	ownerId,
}) {
	const b = await getOrCreateBudget(year, month, ownerId);
	await prisma.expense.create({
		data: {
			amount: -Math.max(0, Math.floor(amount)),
			note,
			categoryId,
			budgetId: b.id,
		},
	});
}

export async function getCategoryExpenses({
	year,
	month,
	categoryId,
	ownerId,
}) {
	await getOrCreateBudget(year, month, ownerId);
	const expenses = await prisma.expense.findMany({
		where: { categoryId },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			amount: true,
			note: true,
			createdAt: true,
		},
	});
	return expenses;
}

export async function getBudgetSnapshot(year, month, ownerId) {
	const b = await getOrCreateBudget(year, month, ownerId);
	const categories = await prisma.category.findMany({
		where: { budgetId: b.id },
		orderBy: { sortOrder: "asc" },
	});
	const expenses = await prisma.expense.findMany({
		where: { budgetId: b.id },
	});
	const spentByCat = Object.fromEntries(categories.map((c) => [c.id, 0]));
	for (const e of expenses)
		spentByCat[e.categoryId] = (spentByCat[e.categoryId] || 0) + e.amount;
	return {
		...b,
		categories: categories.map((c) => ({
			...c,
			spent: spentByCat[c.id] || 0,
		})),
	};
}

export async function setCurrency({ year, month, currencyCode, ownerId }) {
	const b = await getOrCreateBudget(year, month, ownerId);
	await prisma.budget.update({ where: { id: b.id }, data: { currencyCode } });
}

export async function getSavingsSummary(ownerId) {
	const userId = await ensureAccess(ownerId);
	const transfers = await prisma.savingsTransfer.findMany({
		where: { userId },
		include: { category: true },
		orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
	});
	const totalBank = transfers.reduce((s, t) => s + t.amount, 0);
	const totalCurrencies = buildSavingsCurrencyTotals(transfers);
	const monthlyTotals = buildSavingsMonthlyTotals(transfers);
	const categoryTotals = buildSavingsCategoryTotals(transfers);
	return {
		totalBank,
		totalCurrencies,
		monthlyTotals,
		categoryTotals,
		transfers,
	};
}
