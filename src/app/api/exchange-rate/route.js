import { NextResponse } from "next/server";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Серверный кэш курсов валют
const ratesCache = new Map();

// Дефолтные курсы валют к EUR
const DEFAULT_RATES = {
	EUR: 1,
	RSD: 0.00853,
	USD: 0.92,
	RUB: 0.0095,
};

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const from = searchParams.get("from");

		if (!from) {
			return NextResponse.json(
				{ error: "Missing from currency" },
				{ status: 400 }
			);
		}

		// Если валюта EUR, курс всегда 1
		if (from === "EUR") {
			return NextResponse.json({ rate: 1 });
		}

		// Проверяем серверный кэш
		const cached = ratesCache.get(from);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return NextResponse.json({ rate: cached.rate });
		}

		// Всегда конвертируем from -> EUR
		const response = await fetch(
			`https://www.xe.com/api/protected/statistics/?from=${from}&to=EUR`,
			{
				headers: {
					accept: "*/*",
					authorization: "Basic bG9kZXN0YXI6cHVnc25heA==",
				},
				method: "GET",
			}
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch rate ${from} -> EUR`);
		}

		const result = await response.json();
		const rate = result.last1Days.average;

		// Сохраняем в серверный кэш
		ratesCache.set(from, { rate, timestamp: Date.now() });

		return NextResponse.json({ rate });
	} catch (error) {
		// Возвращаем дефолтный курс при ошибке
		const from = new URL(request.url).searchParams.get("from");
		const defaultRate = DEFAULT_RATES[from] || 1;
		return NextResponse.json({ rate: defaultRate });
	}
}
