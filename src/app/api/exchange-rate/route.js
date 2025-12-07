import { NextResponse } from "next/server";
import { getRedisClient } from "@/shared/redis";

const CACHE_TTL = 60 * 60; // 1 hour in seconds

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

		const cacheKey = `exchange_rate:${from}:EUR`;

		// Проверяем Redis кэш
		try {
			const redis = await getRedisClient();
			const cached = await redis.get(cacheKey);
			if (cached) {
				return NextResponse.json({ rate: parseFloat(cached) });
			}
		} catch (redisError) {
			console.error("Redis error:", redisError);
		}

		// Всегда конвертируем from -> EUR
		const response = await fetch(
			`https://www.xe.com/api/protected/live-currency-pairs-rates/?currencyPairs=${from}%2FEUR`,
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
		const rate = result[0].rate;

		// Сохраняем в Redis кэш
		try {
			const redis = await getRedisClient();
			await redis.setEx(cacheKey, CACHE_TTL, rate.toString());
		} catch (redisError) {
			console.error("Redis error:", redisError);
		}

		return NextResponse.json({ rate });
	} catch (error) {
		// Возвращаем дефолтный курс при ошибке
		const from = new URL(request.url).searchParams.get("from");
		const defaultRate = DEFAULT_RATES[from] || 1;
		return NextResponse.json({ rate: defaultRate });
	}
}
