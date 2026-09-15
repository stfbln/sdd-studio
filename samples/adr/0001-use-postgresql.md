---
status: accepted
date: 2026-03-04
decision-makers: [Alice, Bob]
consulted: [Carol]
informed: [team-backend]
---

# Use PostgreSQL for the order store

## Context and Problem Statement

Orders are currently written to an in-memory store that loses data on restart.
We need a durable datastore for the order history that the team can operate
without hiring new specialists.

## Decision Drivers

- Operational cost
- Team familiarity
- Query flexibility for support tooling

## Considered Options

- **PostgreSQL** — Battle-tested relational database, strong ecosystem, easy to self-host or run managed.
- **DynamoDB** — Managed NoSQL, scales elastically without capacity planning.

## Options Comparison

| Option | Operational cost | Team familiarity | Query flexibility for support tooling |
| --- | --- | --- | --- |
| PostgreSQL | ✅ Meets | ✅ Meets | ✅ Meets |
| DynamoDB | ⚠️ Partial: pay-per-request adds up at our volume | ❌ Fails: nobody on the team has run it in production | ⚠️ Partial: needs a separate query layer |

## Decision Outcome

Chosen option: **PostgreSQL**, because it best balances operational cost and the team's familiarity, and support tooling can query it directly with SQL.

### Consequences

- Good, because the team can operate it without ramp-up.
- Bad, because vertical scaling has a ceiling we will eventually need to plan around.

## Pros and Cons of the Options

### PostgreSQL

- Good, because the team already operates it in production for other services.
- Neutral, because scaling further needs read replicas.
- Bad, because it needs a managed offering to avoid the operational burden.

### DynamoDB

- Good, because it scales without capacity planning.
- Bad, because nobody on the team has run it in production.

## More Information

Revisit this decision if order volume grows past 500 writes per second.
