import { EMPTY_SAVINGS_SUMMARY } from "@/shared/lib/savings";

export async function fetchSnapshot(year, month, signal, ownerId = null) {
	try {
	const own = ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : "";
	const res = await fetch(`/api/budget?year=${year}&month=${month}${own}`, {
			cache: "no-store",
			signal,
		});
		if (res.status === 401) {
			if (typeof window !== "undefined")
				window.location.href = "/auth";
			throw new Error("Unauthorized");
		}
		if (!res.ok) throw new Error("failed");
		return await res.json();
	} catch {
		return {
			income: 0,
			currencyCode: "EUR",
			categories: [
				{ id: "food-local", name: "Еда", amount: 0, spent: 0 },
				{ id: "rent-local", name: "Аренда", amount: 0, spent: 0 },
				{
					id: "transport-local",
					name: "Транспорт",
					amount: 0,
					spent: 0,
				},
				{ id: "fun-local", name: "Развлечения", amount: 0, spent: 0 },
			],
		};
	}
}

export async function postAction(action, payload, { signal } = {}) {
	try {
		const res = await fetch("/api/budget", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, payload }),
			signal,
		});
		if (res.status === 401) {
			if (typeof window !== "undefined")
				window.location.href = "/auth";
			throw new Error("Unauthorized");
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const msg = data?.error || "Ошибка";
			alert(msg);
			throw new Error(msg);
		}
		return data;
	} catch (e) {
		if (!String(e?.message || "").includes("Сумма по категориям")) {
			alert("Сервер временно недоступен. Проверьте подключение к БД.");
		}
		throw e;
	}
}

export async function fetchStats(signal, ownerId = null) {
	const own = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : "";
	const r = await fetch(`/api/budget/stats${own}`, { signal });
	if (r.status === 401) {
		if (typeof window !== "undefined") window.location.href = "/auth";
		throw new Error("Unauthorized");
	}
	const d = await r.json().catch(() => []);
	return Array.isArray(d) ? d : [];
}

export async function fetchSavings(signal, ownerId = null) {
	const own = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : "";
	const r = await fetch(`/api/budget/savings${own}`, { signal });
	if (r.status === 401) {
		if (typeof window !== "undefined") window.location.href = "/auth";
		throw new Error("Unauthorized");
	}
	return (
		(await r.json().catch(() => null)) || EMPTY_SAVINGS_SUMMARY
	);
}

// Шаринг бюджетов
export async function shareBudgetWith(ownerId, memberEmail, role = "editor") {
	const r = await fetch("/api/budget/share", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ownerId, memberEmail, role }),
	});
	const d = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(d?.error || "Share error");
	return d;
}

export async function shareBudget(budgetId, memberEmail, role = "editor") {
	return shareBudgetWith(budgetId, memberEmail, role);
}

export async function listAccessibleBudgets() {
	const r = await fetch("/api/budget/list", { cache: "no-store" });
	const d = await r.json().catch(() => []);
	if (!r.ok) throw new Error(d?.error || "List error");
	return Array.isArray(d) ? d : [];
}

export async function fetchBudgetList() {
	return listAccessibleBudgets();
}
