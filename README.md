# Learn Book

A personal book about how the web and software systems work, written for a frontend developer who wants the bigger picture: what the options are, how they work inside, and why to choose one over another. It is about concepts and trade-offs, not syntax or step-by-step tutorials.

Read it at **[learn.buhogeji.me](https://learn.buhogeji.me/)**, in English or [Russian](https://learn.buhogeji.me/ru/).

This is a project I write for myself. It is public, so feel free to read it, but it is not a reference you should rely on without checking the official documentation that each page links to.

## What's inside

- **Web platform**: HTTP and HTTPS, how a browser loads a page, CDNs, sitemaps and other site files.
- **Security**: browser boundaries and CORS, web attacks, authentication and authorization.
- **Architecture**: caching, rendering strategies, state, API styles, application boundaries, scaling, reliability, background jobs, real-time delivery, repository layout.
- **Data**: database types, consistency and transactions, CMS.
- **Observability**: logs, metrics and traces, OpenTelemetry, Web Vitals, error tracking, dashboards and alerting.
- **Delivery**: deployment models, CI/CD, containers, Kubernetes.
- **Tools**: how specific tools implement the concepts (Next.js caching, React Suspense and Server Components, the Apollo Client cache and directives), each checked against a stated version.

Pages link to each other where one concept builds on another, and some topics have an optional quiz.

## Running it locally

Built with [Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/). Requires Node.js 22.

```sh
npm install
npm run dev      # local server
npm run build    # production build; also checks frontmatter and every internal link
```

## Writing content

Content lives in `src/content/docs/`, with the Russian version under `src/content/docs/ru/`.

- [`AGENTS.md`](./AGENTS.md) describes the structure, the page templates and the rules for links.
- [`TRANSLATION.md`](./TRANSLATION.md) has the translation rules and the glossary.

## License

- The written content in `src/content/` is licensed under [CC BY 4.0](./LICENSE-CONTENT.md): reuse it freely with credit.
- The code is licensed under the [MIT License](./LICENSE).
