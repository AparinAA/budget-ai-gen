# Architecture Decision Records

Эта папка хранит ADR проекта Family Budget.

ADR нужен, когда изменение влияет на архитектуру, модель данных, безопасность,
интеграции, публичные API, правила работы агентов или долгосрочные инженерные
ограничения. Небольшие локальные исправления без изменения соглашений можно
делать без нового ADR.

## Индекс

- [ADR-0001: Зафиксировать текущую архитектуру Family Budget](0001-current-project-architecture.md)
- [ADR-0002: Правила работы LLM/AI-агентов с проектом](0002-llm-ai-agent-operating-rules.md)

## Формат

Новые ADR добавляются как `NNNN-short-title.md` со статусом:

- `Proposed` - решение обсуждается.
- `Accepted` - решение принято и должно соблюдаться.
- `Superseded` - решение заменено другим ADR.

Минимальная структура:

```md
# ADR-NNNN: Название

- Status: Proposed | Accepted | Superseded
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences
```
