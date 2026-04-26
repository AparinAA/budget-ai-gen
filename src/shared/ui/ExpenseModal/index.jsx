"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import kit from "@/shared/ui/kit.module.css";
import styles from "./styles.module.css";
import { postAction } from "@/shared/api/budget";
import { useBudgetStore } from "@/shared/store/budgetStore";
import {
	useExchangeRates,
	useTelegramMainButton,
	useTelegramMainButtonState,
	useCategorySettings,
} from "./hooks";
import { CategoryControls, AmountInput } from "./components";
import { ModalHeader } from "@/shared/ui/ModalHeader";

export function ExpenseModal({
	isOpen,
	onClose,
	categoryId,
	categoryName,
	category,
}) {
	const {
		year,
		month,
		setSnapshot,
		ownerId,
		categories,
		currency: baseCurrency,
	} = useBudgetStore();
	const [amount, setAmount] = useState("");
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isTelegram, setIsTelegram] = useState(false);
	const [selectedCurrency, setSelectedCurrency] = useState("RSD");
	const [operationType, setOperationType] = useState("add"); // 'add' или 'subtract'

	// Используем кастомные хуки
	const { exchangeRate, loadingRate } = useExchangeRates(
		isOpen,
		"EUR",
		selectedCurrency
	);
	const {
		isSaving,
		rolloverEnabled,
		rolloverTargetId,
		handleToggleSaving,
		handleToggleRollover,
		handleChangeRolloverTarget,
	} = useCategorySettings(isOpen, category, categoryId);

	// Используем useRef для хранения актуального значения
	const amountRef = useRef(amount);
	const selectedCurrencyRef = useRef(selectedCurrency);
	const exchangeRateRef = useRef(exchangeRate);
	const operationTypeRef = useRef(operationType);

	useEffect(() => {
		amountRef.current = amount;
	}, [amount]);

	useEffect(() => {
		selectedCurrencyRef.current = selectedCurrency;
	}, [selectedCurrency]);

	useEffect(() => {
		exchangeRateRef.current = exchangeRate;
	}, [exchangeRate]);

	useEffect(() => {
		operationTypeRef.current = operationType;
	}, [operationType]);

	// Проверяем, запущено ли в Telegram Mini App
	useEffect(() => {
		setIsTelegram(!!window.Telegram?.WebApp?.initData);
	}, []);

	// Блокировка скролла фона при открытии модального окна
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	// Сброс валюты и типа операции при открытии
	useEffect(() => {
		if (isOpen) {
			setSelectedCurrency("RSD");
			setOperationType("add");
		}
	}, [isOpen]);

	// Функция для отправки расхода (стабильная с useCallback)
	const submitExpense = useCallback(
		async (amountCents, opType) => {
			setIsSubmitting(true);
			try {
				const action =
					opType === "subtract" ? "subtractExpense" : "addExpense";
				const snap = await postAction(action, {
					year,
					month,
					categoryId,
					amount: amountCents,
					ownerId: ownerId || null,
				});
				setSnapshot(snap);
				window.dispatchEvent(new Event("refresh-savings"));
				setAmount("");
				onClose();
			} finally {
				setIsSubmitting(false);
			}
		},
		[year, month, categoryId, ownerId, setSnapshot, onClose]
	);

	// Стабильная функция для установки ошибки
	const handleSetError = useCallback((message) => {
		setError(message);
	}, []);

	// Используем Telegram MainButton
	useTelegramMainButton({
		isOpen,
		isTelegram,
		amountRef,
		selectedCurrencyRef,
		exchangeRateRef,
		operationTypeRef,
		onSubmit: submitExpense,
		onError: handleSetError,
	});

	useTelegramMainButtonState(isOpen, isTelegram, amount);

	// Обработчик для обычной кнопки (не Telegram)
	const handleAddExpense = async () => {
		const amountNum = Number(amount);
		if (!amountNum || amountNum <= 0) {
			setError("Неверная сумма");
			return;
		}

		setIsSubmitting(true);
		setError("");

		try {
			// Конвертируем сумму в EUR (используем курс напрямую)
			const convertedAmount =
				selectedCurrency === "EUR"
					? amountNum
					: amountNum * (exchangeRate || 1);

			const amountCents = Math.round(convertedAmount * 100);
			await submitExpense(amountCents, operationType);
		} catch (err) {
			setError("Неверные параметры");
			setIsSubmitting(false);
		}
	};

	const handleBackdropClick = (e) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	if (!isOpen) return null;

	return (
		<div className={styles.backdrop} onClick={handleBackdropClick}>
			<div className={styles.modal}>
				<ModalHeader
					title={categoryName}
					disabled={isSubmitting}
					onClose={onClose}
				/>

				<CategoryControls
					isSaving={isSaving}
					rolloverEnabled={rolloverEnabled}
					rolloverTargetId={rolloverTargetId}
					isSubmitting={isSubmitting}
					categories={categories}
					categoryId={categoryId}
					onToggleSaving={handleToggleSaving}
					onToggleRollover={handleToggleRollover}
					onChangeRolloverTarget={handleChangeRolloverTarget}
				/>

				<div className={styles.form}>
					<div className={styles.operationTypeToggle}>
						<button
							type="button"
							className={`${styles.toggleButton} ${operationType === "add" ? styles.active : ""}`}
							onClick={() => setOperationType("add")}
							disabled={isSubmitting}
						>
							+ Добавить расход
						</button>
						<button
							type="button"
							className={`${styles.toggleButton} ${operationType === "subtract" ? styles.active : ""}`}
							onClick={() => setOperationType("subtract")}
							disabled={isSubmitting}
						>
							− Вычесть сумму
						</button>
					</div>

					<AmountInput
						amount={amount}
						selectedCurrency={selectedCurrency}
						baseCurrency={baseCurrency || "EUR"}
						exchangeRate={exchangeRate}
						isSubmitting={isSubmitting}
						loadingRate={loadingRate}
						onAmountChange={(e) => {
							setAmount(e.target.value);
							setError("");
						}}
						onCurrencyChange={(e) =>
							setSelectedCurrency(e.target.value)
						}
					/>

					{error && <div className={styles.error}>{error}</div>}

					{!isTelegram && (
						<button
							type="button"
							onClick={handleAddExpense}
							disabled={
								isSubmitting || !amount || Number(amount) <= 0
							}
							className={kit.button}
							style={{
								width: "100%",
								marginTop: "var(--spacing-md)",
							}}
						>
							{isSubmitting
								? operationType === "subtract"
									? "Вычитание..."
									: "Добавление..."
								: operationType === "subtract"
									? "Вычесть сумму"
									: "Добавить расход"}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
