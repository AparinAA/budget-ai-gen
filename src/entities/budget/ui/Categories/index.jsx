"use client";
import kit from "@/shared/ui/kit.module.css";
import styles from "./styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS } from "@/shared/ui/colors";
import { currency } from "@/shared/lib/format";
import { useBudgetStore } from "@/shared/store/budgetStore";
import { postAction } from "@/shared/api/budget";
import { ExpenseModal } from "@/shared/ui/ExpenseModal";
import { ExpensesListModal } from "@/shared/ui/ExpensesListModal";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import { MenuIcon, TrashIcon, ListIcon } from "@/shared/ui/icons";

export function Categories({ onAfterChange }) {
	const {
		year,
		month,
		income,
		currency: currencyCode,
		categories,
		setSnapshot,
		ownerId,
	} = useBudgetStore();

	const allocated = useMemo(() => {
		const inc = Number(income) || 0;
		return categories.map((c) => {
			const amt = Number(c.amount) || 0;
			const pct = inc > 0 ? Math.round((amt / inc) * 100) : 0;
			return {
				...c,
				allocated: amt / 100,
				remaining: Math.max(0, (amt - (c.spent || 0)) / 100),
				percentOfIncome: pct,
			};
		});
	}, [categories, income]);

	// Локальные правки для мгновенного отображения без ожидания сети
	const [localEdits, setLocalEdits] = useState({}); // { [catId]: { percent?: string, isSaving?: boolean, rolloverEnabled?: boolean, rolloverTargetId?: string|null } }
	const [expenseModal, setExpenseModal] = useState({
		isOpen: false,
		categoryId: null,
		categoryName: "",
		category: null,
	});
	const [expensesListModal, setExpensesListModal] = useState({
		isOpen: false,
		categoryId: null,
		categoryName: "",
	});
	const [confirmDelete, setConfirmDelete] = useState({
		isOpen: false,
		categoryId: null,
		categoryName: "",
	});
	const [editingNameId, setEditingNameId] = useState(null); // ID категории, название которой редактируется
	const [editingNameValue, setEditingNameValue] = useState(""); // Временное значение названия

	useEffect(() => {
		setLocalEdits((prev) => {
			const next = {};
			for (const c of categories) {
				// переносим существующие локальные правки, если есть
				next[c.id] = prev[c.id] || {};
			}
			return next;
		});
	}, [categories]);

	// Рефы для дебаунса и отмены по полям
	const percentRefs = useRef(new Map()); // id -> { t, controller }
	const nameInputRef = useRef(null);

	// Автофокус на поле редактирования названия
	useEffect(() => {
		if (editingNameId && nameInputRef.current) {
			nameInputRef.current.focus();
			nameInputRef.current.select();
		}
	}, [editingNameId]);

	// Начать редактирование названия
	const startEditingName = (categoryId, currentName) => {
		setEditingNameId(categoryId);
		setEditingNameValue(currentName);
	};

	// Сохранить новое название
	const saveNewName = (categoryId) => {
		const newName = editingNameValue.trim();
		if (!newName) {
			setEditingNameId(null);
			return;
		}
		postAction("setCategoryName", {
			year,
			month,
			categoryId,
			name: newName,
			ownerId: ownerId || null,
		})
			.then((snap) => {
				setSnapshot(snap);
				setEditingNameId(null);
				window.dispatchEvent(new Event("refresh-savings"));
				onAfterChange?.();
			})
			.catch(() => {
				setEditingNameId(null);
			});
	};

	// Отменить редактирование
	const cancelEditingName = () => {
		setEditingNameId(null);
		setEditingNameValue("");
	};

	// Подтвердить удаление категории
	const handleDeleteCategory = () => {
		const { categoryId } = confirmDelete;
		postAction("removeCategory", {
			year,
			month,
			categoryId,
			ownerId: ownerId || null,
		})
			.then((snap) => {
				setSnapshot(snap);
				setConfirmDelete({
					isOpen: false,
					categoryId: null,
					categoryName: "",
				});
				window.dispatchEvent(new Event("refresh-savings"));
				onAfterChange?.();
			})
			.catch(() => {
				setConfirmDelete({
					isOpen: false,
					categoryId: null,
					categoryName: "",
				});
			});
	};

	return (
		<section
			className={kit.card}
			style={{ background: "var(--bg-primary)" }}
		>
			<h3 className={kit.cardTitle}>Категории</h3>
			<div style={{ display: "grid", gap: "var(--spacing-md)" }}>
				{allocated.map((c, idx) => (
					<div key={c.id} className={styles.categoryItem}>
						<div className={styles.topRow}>
							<div className={styles.nameRow}>
								<div
									className={styles.dot}
									style={{
										background: COLORS[idx % COLORS.length],
									}}
								/>
								{editingNameId === c.id ? (
									<input
										ref={nameInputRef}
										type="text"
										value={editingNameValue}
										onChange={(e) =>
											setEditingNameValue(e.target.value)
										}
										onBlur={() => saveNewName(c.id)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												saveNewName(c.id);
											} else if (e.key === "Escape") {
												cancelEditingName();
											}
										}}
										className={kit.input}
										style={{ flex: 1, minWidth: 0 }}
									/>
								) : (
									<div
										className={styles.categoryName}
										onClick={() =>
											startEditingName(c.id, c.name)
										}
										style={{ cursor: "pointer" }}
										title="Нажмите, чтобы изменить название"
									>
										{c.name}
									</div>
								)}
								<button
									onClick={() =>
										setExpenseModal({
											isOpen: true,
											categoryId: c.id,
											categoryName: c.name,
											category: c,
										})
									}
									className={kit.button}
									style={{
										padding: "6px 10px",
										minHeight: "32px",
									}}
									title="Управление категорией"
								>
									<MenuIcon size={14} />
								</button>
								<button
									onClick={() =>
										setExpensesListModal({
											isOpen: true,
											categoryId: c.id,
											categoryName: c.name,
										})
									}
									className={kit.button}
									style={{
										padding: "6px 10px",
										minHeight: "32px",
									}}
									title="Журнал расходов"
								>
									<ListIcon size={14} />
								</button>
								<button
									onClick={() =>
										setConfirmDelete({
											isOpen: true,
											categoryId: c.id,
											categoryName: c.name,
										})
									}
									className={`${kit.button} ${kit.buttonSecondary}`}
									style={{
										padding: "6px 10px",
										minHeight: "32px",
									}}
									title="Удалить категорию"
								>
									<TrashIcon size={14} />
								</button>
							</div>
							<div className={kit.label}>
								Выделено: {currency(c.allocated, currencyCode)}{" "}
								· {c.percentOfIncome}% от дохода
							</div>
							<div className={kit.label}>
								Потрачено:{" "}
								{currency((c.spent || 0) / 100, currencyCode)}
							</div>
							{c.isSaving && (
								<div style={{ color: "#57d9a3", fontSize: 13 }}>
									К накоплению:{" "}
									{currency(
										(c.spent || 0) / 100,
										currencyCode
									)}
								</div>
							)}
						</div>
						<div>
							<div className={styles.progress}>
								<div
									className={styles.progressFill}
									style={{
										width: `${Math.min(100, (c.spent / 100 / (c.allocated || 1)) * 100)}%`,
										background: COLORS[idx % COLORS.length],
									}}
								/>
							</div>
							<div className={styles.percentRow}>
								<span
									className={kit.muted}
									style={{ fontSize: 12 }}
								>
									Изменить сумму
								</span>
								<input
									type="number"
									min="0"
									value={
										localEdits[c.id]?.amount ??
										String(
											Math.round(
												(Number(c.amount) || 0) / 100
											)
										)
									}
									onChange={(e) => {
										const raw = e.target.value;
										setLocalEdits((s) => ({
											...s,
											[c.id]: {
												...(s[c.id] || {}),
												amount: raw,
											},
										}));
										const cell = percentRefs.current.get(
											c.id
										) || { t: null, controller: null };
										if (cell.t) clearTimeout(cell.t);
										if (cell.controller)
											cell.controller.abort();
										const controller =
											new AbortController();
										cell.controller = controller;
										const valueCents = Math.max(
											0,
											Math.floor(Number(raw) * 100 || 0)
										);
										cell.t = setTimeout(() => {
											postAction(
												"setCategoryAmount",
												{
													year,
													month,
													categoryId: c.id,
													amount: valueCents,
													ownerId: ownerId || null,
												},
												{ signal: controller.signal }
											)
												.then((snap) => {
													setSnapshot(snap);
													window.dispatchEvent(
														new Event(
															"refresh-savings"
														)
													);
												})
												.catch(() => {})
												.finally(() => {
													cell.controller = null;
													setLocalEdits((s) => ({
														...s,
														[c.id]: {
															...(s[c.id] || {}),
															amount: undefined,
														},
													}));
												});
										}, 1000);
										percentRefs.current.set(c.id, cell);
									}}
									className={kit.input}
									style={{ width: 120 }}
								/>
								<span
									className={kit.muted}
									style={{ fontSize: 12 }}
								>
									Остаток:{" "}
									<b style={{ color: "var(--text-primary)" }}>
										{currency(c.remaining, currencyCode)}
									</b>
								</span>
							</div>
						</div>
					</div>
				))}
				{allocated.length === 0 && (
					<div className={kit.muted}>
						Добавьте хотя бы одну категорию
					</div>
				)}
			</div>

			<ExpenseModal
				isOpen={expenseModal.isOpen}
				onClose={() => {
					setExpenseModal({
						isOpen: false,
						categoryId: null,
						categoryName: "",
						category: null,
					});
					onAfterChange?.();
				}}
				categoryId={expenseModal.categoryId}
				categoryName={expenseModal.categoryName}
				category={expenseModal.category}
			/>

			<ExpensesListModal
				isOpen={expensesListModal.isOpen}
				onClose={() => {
					setExpensesListModal({
						isOpen: false,
						categoryId: null,
						categoryName: "",
					});
				}}
				categoryId={expensesListModal.categoryId}
				categoryName={expensesListModal.categoryName}
			/>

			<ConfirmModal
				isOpen={confirmDelete.isOpen}
				onClose={() =>
					setConfirmDelete({
						isOpen: false,
						categoryId: null,
						categoryName: "",
					})
				}
				onConfirm={handleDeleteCategory}
				title="Удаление категории"
				message={`Вы уверены, что хотите удалить категорию "${confirmDelete.categoryName}"? Все расходы в этой категории будут удалены.`}
				confirmText="Удалить"
				cancelText="Отменить"
			/>
		</section>
	);
}
