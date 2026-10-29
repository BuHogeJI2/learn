---
title: CMS
description: What a content management system is for, how content models, drafts, preview and publishing work, coupled versus headless delivery, and when a CMS pays off compared with files or your own app data.
related:
  - architecture/rendering
  - architecture/caching
  - data/database-types
  - architecture/api-styles
  - security/web-attacks
  - delivery/deployment-models
officialDocs:
  - title: Sanity — Content modeling
    url: https://www.sanity.io/docs/content-modelling
  - title: Sanity — Introduction to visual editing
    url: https://www.sanity.io/docs/visual-editing/introduction-to-visual-editing
  - title: Strapi — Documentation
    url: https://docs.strapi.io/
  - title: Payload — What is Payload?
    url: https://payloadcms.com/docs/getting-started/what-is-payload
  - title: WordPress — REST API handbook
    url: https://developer.wordpress.org/rest-api/
  - title: Next.js — Draft Mode
    url: https://nextjs.org/docs/app/guides/draft-mode
---

## What problem it solves

Websites have content that people who aren't developers need to change: marketing pages, articles, product descriptions, FAQs, banners, translations. If that content lives in code, every typo fix needs a developer and a [deploy](/delivery/deployment-models/#releasing-from-commit-to-users).

A **CMS** (content management system) gives editors an interface to create, edit, review, schedule and publish content, and gives developers that content in a structured form. Around this core it usually adds:

- roles and permissions (who may publish);
- versions and history;
- drafts and preview;
- localization;
- a media library;
- approval workflows and scheduled publishing.

## Mental model: content model, workflow, delivery

```
Editors ──► CMS interface ──► content store (drafts, versions)
                                    │ publish
                                    ▼
              delivery: API, webhook, build ──► site (render + cache + CDN)
```

Every CMS has three parts, and choosing one is mostly about how it handles each:

1. **The content model**: content types and their fields. An "Article" has a title, a slug (the URL part, such as `how-cdns-work`), an author (a reference to an "Author"), a body, a cover image and SEO fields (the title and description shown by search engines). It is a database schema for content ([database types](/data/database-types/)).
2. **The editorial workflow**: draft → review → scheduled → published → archived, with versions and rules about who can do what.
3. **Delivery**: how published content reaches the site and its users, which is a question of [rendering](/architecture/rendering/), [caching](/architecture/caching/) and the [CDN](/web-platform/cdn/) (servers near users that keep copies).

## Types of CMS

| Type | How it works | Strengths | Weaknesses | Examples |
| --- | --- | --- | --- | --- |
| **Traditional (coupled)** | Stores the content **and** renders the site with themes and templates | Everything in one place; editors see real pages; huge plugin ecosystems | The frontend is tied to the CMS's technology by default (many also offer an API for other channels); plugins need security updates | WordPress, Drupal, Joomla |
| **Headless** (API-first: built to be used through an API) | Stores content and serves it through an API ([REST or GraphQL](/architecture/api-styles/)); the frontend is a separate app | Any framework; many channels (web, mobile app); clean structured content | Preview and page layout need extra work; more moving parts | Contentful, Sanity, Strapi, Payload, Directus, Hygraph |
| **Visual headless / hybrid** | A headless API plus visual editing or a page builder on top of your own components | Editors get layout control, developers keep the frontend | More complexity; depends on vendor features | Storyblok, Builder.io |
| **File-based (Git-based)** | Content is Markdown, MDX or JSON files in the repository; an optional editor UI commits changes to Git | Git history and review; in the simplest setup no database and no cost; a natural fit for static sites | In a simple static setup every change is a build, and relations and workflows are weak; some products add a content API, an editor interface and paid team features | Decap CMS, TinaCMS, Keystatic, plain Markdown (this book) |

The categories overlap. WordPress and Drupal also have APIs and can be used headless, but their visual editing then works only if your frontend is integrated with it.

Two more groups overlap with CMSs: **site builders and commerce platforms** (Webflow, Wix, Shopify) manage content inside their own hosted product, and **DXPs** (digital experience platforms such as Adobe Experience Manager, Sitecore, Optimizely) are enterprise suites that add personalization, analytics and campaign tools.

A separate choice is **hosted or self-hosted**: Contentful, Sanity and Storyblok are services you rent; Strapi, Payload and Directus are apps you can run yourself (most also have a hosted version). Self-hostable doesn't always mean open source: Directus, for example, uses a license that restricts some commercial uses, so check the current license.

## Content modeling: structure, not pages

- **Model by meaning, not by layout.** A "Product" with a name, description and images can appear on many pages, in the app and in emails. A "Homepage hero text 2" field is tied to one design and must be remodeled at the next redesign.
- **References** connect entries (Article → Author, Article → Category), like relations in a database. Deep chains of references mean many lookups; fetch them in one query, or copy the few fields you need ([N+1](/architecture/api-styles/#how-they-compare)).
- **Rich text as structured data.** Store formatted text as structured JSON (blocks, marks, links) rather than raw HTML. It renders to any channel and is safer. Structure alone doesn't make it safe: render it through your own allowlisted components, keep text escaped, and check link URLs and embeds. If a CMS gives you HTML, sanitize it before rendering ([XSS](/security/web-attacks/#xss-data-that-becomes-code)).
- **Blocks and page builders.** Editors compose pages from predefined components (hero, grid, call to action). This gives them freedom, but mixes layout with content. Keep the set of blocks small and owned by developers.
- **Localization**: translate per field or per entry, and decide what happens when a translation is missing.
- **Media**: serve images through an image service that resizes and converts them ([CDN](/web-platform/cdn/#what-a-cdn-does-besides-caching)).
- **Schema changes are migrations.** Renaming a field means changing thousands of entries. Some CMSs define the content model in code (Sanity, Payload, Strapi), so it is versioned and reviewed together with the app.

## Drafts, preview and publishing

- **Draft and published versions.** The goal: anonymous requests get only published content, and only authorized editors get drafts. Some CMSs use a separate preview API or token for this, others the same API with a status option and permissions. Check the configuration: in some products drafts or workflow stages must be switched on per content type.
- **Preview.** Editors want to see a draft on the real site before publishing. The site must render that page with draft content, **skip all caches**, and do it only for authorized editors. Frameworks have a mode for this, such as Next.js Draft Mode, which sets a cookie that bypasses static and cached rendering ([Next.js caching](/tools/nextjs/caching/)). Preview tokens stay on the server, and preview pages must never be cached publicly or indexed.
- **Visual editing.** The editor clicks on text on the previewed page and edits that field directly; the CMS maps page elements back to content fields.
- **Scheduling.** "Publish on Monday at 9:00" only works if something updates the site at that moment.

How a publish reaches the site, usually through a **webhook** (an HTTP request the CMS sends to your site when something happens):

| Approach | How | Delay | Fits |
| --- | --- | --- | --- |
| **Rebuild** | A CMS webhook triggers a new build and [deploy](/delivery/deployment-models/#releasing-from-commit-to-users) | Minutes; grows with site size | Small static sites, rare edits |
| **On-demand revalidation** | A webhook tells the site to regenerate the affected pages or purge cache tags ([freshness strategies](/architecture/caching/#freshness-strategies)) | Usually seconds; the page may be regenerated only on the next visit, and that visitor may still get the old version | Most sites with a headless CMS |
| **Render per request** | Render the page on each request; read CMS data from a cache that is invalidated by tags | As fast as the invalidation; CMS API calls only on cache misses | Highly dynamic or personalized pages |

The long-cache-plus-webhook pattern is the usual answer to "fast site, but published changes must appear within a minute". The minute is a target to measure, not a guarantee: it depends on webhook delivery, invalidation and regeneration.

## Typical failures

- **A content model copied from the current design**, so a redesign means remodeling everything.
- **CMS HTML rendered without sanitizing.** One compromised editor account, or the CMS itself, can inject scripts.
- **Leaking previews**: draft content cached publicly or indexed by search engines, or a preview token in client code.
- **Unreliable webhooks.** Providers retry only a few times and may deliver out of order, so a lost webhook can leave the site stale under a long cache. Keep a maximum cache lifetime as a safety net, log and alert on failed deliveries, make the handler [idempotent](/architecture/reliability/#idempotency-making-again-safe), and verify the signature so nobody else can trigger it.
- **Invalidating only the changed page.** Lists, the home page and every page that references the entry show it too; tag them so that publishing, unpublishing and deleting refresh all of them.
- **A full rebuild on every edit** of a site with tens of thousands of pages.
- **Fetching content per request without caching**, which hits the CMS API's rate limits and bill (API calls are often paid).
- **Unlimited page-builder freedom**, leading to inconsistent design and broken layouts.
- **Lock-in**: content in a proprietary format with no practical export.
- **Transactional data in an editorial CMS.** Orders, stock and prices need the guarantees of your own database or commerce system; a classic CMS is for editorial content. Some products, such as Payload, are full application frameworks with their own database and access control and can hold both; then design them as an app, not as a CMS.
- **Slug changes without redirects**, breaking every existing link.

## When a CMS pays off

- **Only developers edit, and content changes rarely:** Markdown or MDX files in the repository. Git gives history and review for free.
- **Non-technical editors, frequent changes, approvals, several languages:** a CMS.
- **A marketing site where editors want to control layout:** a traditional or visual CMS, or a site builder.
- **Content shared by several frontends** (web and a mobile app), with developers in full control of the frontend: headless.
- **Content tied to app logic** (a product catalog with stock and prices, orders): your own database and admin interface, or a commerce platform as the authority for price and stock; a CMS for the editorial parts around it. Moderated submissions from users, such as reviews or guest articles, can still be editorial content.

Questions to ask: who edits, and how often? Do they need preview or layout control? How many channels and languages? Who hosts and secures it? What does it cost per editor seat and per API call?

## Landscape

- **Traditional:** WordPress, Drupal, Joomla; Ghost for publishing.
- **Headless, hosted:** Contentful, Sanity, Storyblok, Hygraph, Prismic, DatoCMS, Contentstack.
- **Headless, self-hostable:** Strapi, Payload and KeystoneJS (open source), Directus (source-available, with license restrictions).
- **File-based:** Decap CMS, TinaCMS, Keystatic; framework content collections (Astro, Nuxt Content).
- **Visual builders:** Webflow, Builder.io, Framer, Wix Studio.
- **Enterprise DXPs:** Adobe Experience Manager, Sitecore, Optimizely.
