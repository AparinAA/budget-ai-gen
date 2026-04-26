"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import kit from "@/shared/ui/kit.module.css";
import { fetchSavings, postAction } from "@/shared/api/budget";
import { currency } from "@/shared/lib/format";
import {
	EMPTY_SAVINGS_SUMMARY,
	buildSavingsCategoryTotals,
	formatSavingsMonthLabel,
	hasMonthlyCategoryTotals,
} from "@/shared/lib/savings";
import { useBudgetStore } from "@/shared/store/budgetStore";
import { RefreshIcon } from "@/shared/ui/icons";

function normalizeSavingsData(data) {
	if (!data || typeof data !== "object") return EMPTY_SAVINGS_SUMMARY;

	const normalized = {
		totalBank: Number(data.totalBank) || 0,
		totalCurrencies: Array.isArray(data.totalCurrencies)
			? data.totalCurrencies
			: [],
		monthlyTotals: Array.isArray(data.monthlyTotals)
			? data.monthlyTotals
			: [],
		transfers: Array.isArray(data.transfers) ? data.transfers : [],
	};

	if (Array.isArray(data.categoryTotals)) {
		normalized.categoryTotals = data.categoryTotals;
	}

	return normalized;
}

function formatCurrencyTotals(totals, fallbackAmount, fallbackCurrencyCode) {
	const fallbackTotals = [
		{
			amount: fallbackAmount,
			currencyCode: fallbackCurrencyCode,
		},
	];
	const currencies =
		Array.isArray(totals) && totals.length > 0
			? totals
			: fallbackTotals;

	return currencies
		.map((item) =>
			currency(
				(Number(item.amount) || 0) / 100,
				item.currencyCode || fallbackCurrencyCode
			)
		)
		.join(" + ");
}

export function SavingsCard({ currencyCode, onAfterRecalculate }) {
	const { year, month, ownerId } = useBudgetStore();
	const [data, setData] = useState(EMPTY_SAVINGS_SUMMARY);
	const [expandedCategoryName, setExpandedCategoryName] = useState(null);

	const load = useCallback(() => {
		fetchSavings(undefined, ownerId || null)
			.then((d) => setData(normalizeSavingsData(d)))
			.catch(() => setData(EMPTY_SAVINGS_SUMMARY));
	}, [ownerId]);

	useEffect(() => {
		load();
		const handler = () => load();
		window.addEventListener("refresh-savings", handler);
		return () => window.removeEventListener("refresh-savings", handler);
	}, [load]);

	const { totalBank, totalCurrencies, categoryTotals, transfers } = data;
	const savingsRows = useMemo(
		() =>
			hasMonthlyCategoryTotals(categoryTotals)
				? categoryTotals
				: buildSavingsCategoryTotals(transfers),
		[categoryTotals, transfers]
	);

	const toggleCategory = useCallback((name) => {
		setExpandedCategoryName((current) => (current === name ? null : name));
	}, []);

	return (
		<section className={kit.card}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
				<h3 className={kit.cardTitle} style={{ marginBottom: 0, marginTop: 0 }}>
					Накопления
				</h3>
				<button
					className={kit.button}
					onClick={() =>
						postAction("recalculateSavings", { year, month, ownerId: ownerId || null })
							.then(() => {
								onAfterRecalculate?.();
								load();
							})
							.catch(() => {})
					}
					style={{ padding: "6px 10px", minHeight: "32px" }}
					title="Пересчитать за период"
				>
					<RefreshIcon size={14} />
				</button>
			</div>
			<div className={kit.muted} style={{ marginBottom: 8 }}>
				Всего накоплено:{" "}
				<b style={{ color: "#e6edf3" }}>
					{formatCurrencyTotals(
						totalCurrencies,
						totalBank,
						currencyCode
					)}
				</b>
			</div>
			<div className={kit.tableWrap}>
				<table className={kit.table}>
					<thead>
						<tr className={kit.tableHead}>
							<th className={kit.theadTh}>Категория</th>
							<th className={kit.theadTh}>Общая сумма</th>
							<th className={kit.theadTh}>Записей</th>
						</tr>
					</thead>
					<tbody>
						{Array.isArray(savingsRows) && savingsRows.length > 0 ? (
							savingsRows.slice(0, 20).map((row) => {
								const isExpanded = expandedCategoryName === row.name;
								const months = Array.isArray(row.months)
									? row.months
									: [];

								return (
									<Fragment key={row.name}>
										<tr className={kit.tr}>
											<td className={kit.td}>
												<button
													type="button"
													onClick={() => toggleCategory(row.name)}
													aria-expanded={isExpanded}
													style={{
														alignItems: "center",
														background: "transparent",
														border: 0,
														color: "inherit",
														cursor: "pointer",
														display: "inline-flex",
														font: "inherit",
														gap: 8,
														padding: 0,
														textAlign: "left",
													}}
												>
													<span
														aria-hidden="true"
														style={{
															display: "inline-block",
															transform: isExpanded
																? "rotate(90deg)"
																: "rotate(0deg)",
															transition:
																"transform var(--transition-base)",
														}}
													>
														&gt;
													</span>
													<span>{row.name}</span>
												</button>
											</td>
											<td className={kit.td}>
												{formatCurrencyTotals(
													row.currencies,
													row.amount,
													row.currencyCode || currencyCode
												)}
											</td>
											<td className={kit.td}>
												{row.transfersCount || 0}
											</td>
										</tr>
										{isExpanded ? (
											<tr className={kit.tr}>
												<td className={kit.td} colSpan={3}>
													<div
														role="region"
														aria-label={`Накопления по месяцам: ${row.name}`}
														style={{
															display: "grid",
															gap: 6,
														}}
													>
														{months.map((monthRow) => (
															<div
																key={`${row.name}-${monthRow.year}-${monthRow.month}`}
																style={{
																	alignItems: "center",
																	display: "grid",
																	gap: 12,
																	gridTemplateColumns:
																		"minmax(110px, 1fr) minmax(120px, auto) minmax(64px, auto)",
																}}
															>
																<span>
																	{formatSavingsMonthLabel(monthRow)}
																</span>
																<strong>
																	{formatCurrencyTotals(
																		monthRow.currencies,
																		monthRow.amount,
																		monthRow.currencyCode ||
																			currencyCode
																	)}
																</strong>
																<span className={kit.muted}>
																	{monthRow.transfersCount || 0} зап.
																</span>
															</div>
														))}
													</div>
												</td>
											</tr>
										) : null}
									</Fragment>
								);
							})
						) : (
							<tr>
								<td colSpan={3} className={kit.empty}>
									Пока нет накоплений
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}
