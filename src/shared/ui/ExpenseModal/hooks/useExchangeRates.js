import { useState, useEffect } from "react";

// Дефолтные курсы валют к EUR (для предотвращения скачков UI)
const DEFAULT_RATES = {
	EUR: 1,
	RSD: 0.00853, // 1 RSD ≈ 0.00853 EUR
	USD: 0.92, // 1 USD ≈ 0.92 EUR
	RUB: 0.0095, // 1 RUB ≈ 0.0095 EUR
};

export function useExchangeRates(
	isOpen,
	baseCurrency = "EUR",
	targetCurrency = "EUR"
) {
	const [exchangeRate, setExchangeRate] = useState(
		DEFAULT_RATES[targetCurrency] || 1
	);
	const [loadingRate, setLoadingRate] = useState(false);

	useEffect(() => {
		if (!isOpen) return;

		const fetchExchangeRate = async () => {
			try {
				setLoadingRate(true);
				
				const response = await fetch(`/api/exchange-rate?from=${targetCurrency}`);
				const result = await response.json();
				
				setExchangeRate(result.rate);
			} catch (err) {
				console.error("Error fetching exchange rate:", err);
				// Используем дефолтный курс при ошибке
				setExchangeRate(DEFAULT_RATES[targetCurrency] || 1);
			} finally {
				setLoadingRate(false);
			}
		};

		fetchExchangeRate();
	}, [isOpen, targetCurrency]);

	return { exchangeRate, loadingRate };
}
