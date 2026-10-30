---
title: Testing strategy
description: What each kind of test can prove, what it costs, and how to choose coverage for a user journey instead of a percentage.
related:
  - delivery/ci-cd
  - architecture/api-styles
  - architecture/repository-layout
  - web-platform/accessibility
officialDocs:
  - title: Martin Fowler — The Practical Test Pyramid
    url: https://martinfowler.com/articles/practical-test-pyramid.html
  - title: Martin Fowler — Test Double
    url: https://martinfowler.com/bliki/TestDouble.html
  - title: Testing Library — Guiding Principles
    url: https://testing-library.com/docs/guiding-principles/
  - title: Playwright — Best Practices
    url: https://playwright.dev/docs/best-practices
  - title: Pact — Introduction to contract testing
    url: https://docs.pact.io/
---

## What problem it solves

A test is a way to buy **confidence that a change is safe to release**, and every test has a price: time to write it, time to run it, and work to keep it alive when the code changes. Without a strategy, teams pay a lot and get little: thousands of tests that break on every refactoring, while the bug that reaches production sits in the gap between two components that were each "fully tested".

The questions a strategy answers are not about syntax:

- What could break, and what would that cost?
- What is the cheapest test that would catch it?
- What does a green result actually prove?

## Mental model: a test draws a boundary

Every test puts a line around some part of the system. Inside the line, real code runs. Outside it, something is replaced or simply not involved. **A test proves things only about what is inside its boundary.**

```
                    what runs for real                     proves
unit           ┌ function ┐                               this logic is correct
component      ┌ component + its children ┐               this UI behaves for a user
integration    ┌ your code + real database ┐              the parts work together
contract       ┌ consumer's expectation ↔ provider ┐      two sides still agree
end-to-end     ┌ browser → frontend → API → database ┐    a user journey works
```

A wider boundary proves more about the real system, and it costs more: it is slower, harder to set up, and when it fails it says less about where the problem is. A narrower boundary is fast and precise, and it can stay green while the product is broken.

The tool doesn't decide the type. A test in a real browser with a faked API is not end-to-end: it proves nothing about the real API or database.

So the question is never "unit or end-to-end?". It is **which boundary catches this risk at the lowest cost**.

## Test types and what they prove

| Type | Boundary | Catches | Misses | Speed |
| --- | --- | --- | --- | --- |
| **Static checks** (types, lint) | The code as text | Wrong shapes, typos, unsafe patterns | Wrong behavior | Seconds |
| **Unit** | One function or module | Logic with many cases: prices, dates, parsers, state machines | Anything between modules | Milliseconds |
| **Component** | A UI component in a simulated or real browser | Behavior for a user: what appears after a click | The rest of the app and the backend; in a simulated browser, also real layout | Milliseconds to seconds |
| **Integration** | Your code plus real dependencies such as a database | Wrong queries, [transactions](/data/consistency/#transactions-and-acid) (all-or-nothing groups of writes), [migrations](/data/schema-evolution/), framework wiring | Other services, the real browser | Seconds |
| **Contract** | Each side of an API tested against the other's recorded expectations | A change that breaks the other team ([API evolution](/architecture/api-styles/#evolution-the-long-term-cost)) | Whether the feature is useful | Seconds |
| **End-to-end** (E2E) | A real browser against a running system | A broken journey: sign-in, checkout | Rare cases, because each one is expensive | Minutes |
| **Visual regression** | Screenshots compared with a baseline | Unintended layout and style changes | Behavior | Seconds to minutes |

A contract test has two halves: the consumer records what it expects, and the provider's tests verify those expectations. Checking only that a response matches an OpenAPI description (a machine-readable description of an API) is narrower: it shows the shape is valid, not that the consumer's real examples work.

Types are checks too. In a typed codebase, tests that only confirm "this function received a string" from your own code add cost and no information. Data from outside (API responses, user input) is another matter: types are erased at runtime, so validating it is still worth testing.

A few more checks answer questions these types don't: **load tests** ([scaling](/architecture/scaling/)), **accessibility checks** ([accessibility](/web-platform/accessibility/#what-tools-can-and-cannot-check)), and **fault injection** ([reliability](/architecture/reliability/#how-to-apply)).

## Real dependencies or test doubles

A **test double** is a stand-in for a real dependency. Mock is the common name for all of them, although strictly a **stub** returns canned answers, and a **mock** also checks how it was called.

Each double trades realism for speed and control, and it brings an assumption: *the real thing behaves like this*. When the assumption becomes false, the test stays green and production fails. The classic case is a mocked API that still returns the old field name.

| Dependency | Usual choice | Why |
| --- | --- | --- |
| Your own code | Real | Mocking your own modules ties tests to the structure of the code |
| Your database | Real, in a [container](/delivery/containers/) or an in-memory equivalent of the same engine | SQLite doesn't behave like PostgreSQL; queries, constraints and transactions are what you need to test |
| Your own API, seen from the frontend | Fake at the network level (Mock Service Worker), with the same expectations verified against the provider | Tests see real `fetch` calls, and the verification keeps the fake honest |
| A third-party service (payments, email) | Fake or the vendor's sandbox | You can't control it, it costs money, and it fails for reasons unrelated to your code |
| Time and randomness | Controlled | Otherwise results change from run to run |

**Replace at the outermost boundary you can.** Faking the network keeps your `fetch` wrapper, your retry code and your error handling in the test. Faking your own `useOrders` hook removes them.

## Test behavior, not implementation

A good test fails when the product breaks and stays green when the code is reorganized. A test that does the opposite is worse than none: it blocks refactoring and teaches people to update tests without reading them.

- **Assert what a user or caller can see**: the text on screen, the response, the row in the database. Not which internal function was called or what a component's state holds.
- **Query the UI the way users do**: by role and accessible name, not by CSS class. This is the main idea of Testing Library, and it makes tests a small check of [accessibility](/web-platform/accessibility/) too.
- **Avoid large snapshots.** A snapshot that changes with every edit gets approved without reading. Small ones suit stable, specific output, such as a generated file.
- **Keep tests independent.** Each test creates its own data. Shared data and a required order make tests fail randomly ([flaky tests](/delivery/ci-cd/#typical-failures)).
- **Wait for conditions, not for time.** `sleep(2000)` is either too slow or too short.

## Shapes: pyramid, trophy, and your own risks

Two pictures are often quoted:

```
Test pyramid                  Testing trophy
     ▲  few E2E                    ▲  few E2E
    ▲▲▲  some integration        ▲▲▲▲▲  most integration
  ▲▲▲▲▲▲▲  many unit              ▲▲▲  some unit
                                ▔▔▔▔▔▔▔  static checks
```

- **The test pyramid** (Mike Cohn) says many fast tests at the bottom and few slow ones at the top, because of cost.
- **The testing trophy** (Kent C. Dodds) moves the weight to integration tests, because in frontend code most bugs are in how parts work together, and modern tools made such tests fast.

They agree on the important point: few E2E tests, and only for what matters most. Past that, the right shape depends on where the risk lives. A pricing engine deserves many unit tests. A CRUD admin panel (screens that create, read, update and delete records) gets most of its value from integration tests. An app that only composes other services needs contract tests. Use the shapes as a starting argument, not as a rule.

## Choosing coverage for a user journey

Take one journey, such as checkout, and walk through it:

1. **List what can go wrong**, and what each failure costs: a wrong total, a double charge, a broken button, an ugly layout.
2. **Give each risk the narrowest test that catches it.** Totals and discounts: unit tests with many cases. The order written in one transaction: an integration test. The contract with the payment provider: a contract test or sandbox. The cart UI's states: component tests.
3. **Add one E2E test for the happy path**, plus one or two failures users really meet.
4. **Decide what stays untested on purpose**, and how you would notice in production instead: [monitoring](/observability/logs-metrics-traces/), a [canary](/delivery/deployment-models/#releasing-from-commit-to-users) release, a [feature flag](/delivery/deployment-models/#releasing-from-commit-to-users).

**Coverage percentage** (how many lines ran during tests) shows what is *not* tested. It doesn't show that anything is tested well: a test can run a line and check nothing. Treat a fixed target as a warning sign, because it rewards easy tests of unimportant code. **Mutation testing** (the tool changes your code and checks that some test fails) measures test quality more honestly, at a high cost in run time.

When a bug reaches production, add a test at the narrowest boundary that would have caught it. Over time this puts tests where real failures happen.

## Typical failures

- **The ice cream cone**: many slow E2E tests and few fast ones. The suite takes an hour, and people stop waiting for it ([pipeline speed](/delivery/ci-cd/#pipeline-design-choices)).
- **Mocks everywhere.** All tests pass and the app doesn't start, because no test ever connected the real parts.
- **Tests that mirror the code**: they check that `save` called `repository.insert`, so any refactoring breaks them and no bug does.
- **E2E tests for every edge case**, when a unit test would cover the same rule in milliseconds.
- **Flaky tests** that are re-run until green, until nobody trusts a red result.
- **A database fake that behaves differently** from the real one, so migrations and constraints are never tested.
- **Shared test data** that makes results depend on order.
- **Chasing a coverage number** with tests that assert nothing.
- **Testing only the happy path**: no test for timeouts, empty states or a `500` from the API.

## When to invest, and when not

- **Always:** static checks, plus tests for logic with many cases and for anything that handles money or permissions.
- **Short-lived prototypes:** a few E2E smoke tests (short checks that the main flow works) are often enough. Delete them with the prototype.
- **Code that changes every week:** test at a wider boundary, so the tests survive the changes.
- **Stable, heavily reused code** (a design system, a shared library): many narrow tests pay off, because every consumer depends on them.
- **A legacy system without tests:** start with a few wide tests around the behavior you must keep, then refactor under their protection.

## Landscape

- **Unit and component runners:** Vitest, Jest, Node.js's built-in test runner; Testing Library for querying the UI.
- **End-to-end and browser:** Playwright, Cypress, WebdriverIO; Vitest browser mode for component tests in a real browser.
- **Fakes and real dependencies:** Mock Service Worker (network-level fakes), Testcontainers (real databases and services in containers).
- **Contracts:** Pact (consumer-driven contracts), OpenAPI diff tools, GraphQL schema checks.
- **Visual:** Storybook, Chromatic, Percy, Playwright screenshots.
- **Test quality:** Stryker (mutation testing), the coverage reports built into test runners.
