---
title: Sitemaps, robots.txt and other site files — check yourself
description: Scenario questions about crawling, indexing and making a site installable.
quizFor: web-platform/site-files
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Search traffic falls after a release

A week after a release, search traffic starts to drop, and new pages don't appear in Google at all. Nothing in the app looks broken. Where do you look first?

<details>
<summary>Answer</summary>

Open `https://your-site/robots.txt` in production. A classic cause is the staging file with `Disallow: /` [deployed](/delivery/deployment-models/#releasing-from-commit-to-users) to production: crawlers stop fetching the site, so changes and new pages no longer reach search.

Fix the file, then check it with the robots.txt report and the URL Inspection tool in Search Console and resubmit the sitemap. To stop it from happening again, generate `robots.txt` per environment from configuration (not a copied file), and protect staging with [authentication](/security/auth/) (access only after logging in) or `X-Robots-Tag: noindex` instead of a different `robots.txt`.

</details>

## 2. The page that won't leave search

You want `/old-pricing` out of search results. You added `Disallow: /old-pricing` to `robots.txt` and `<meta name="robots" content="noindex">` to the page. Weeks later it is still in the results. Why?

<details>
<summary>Answer</summary>

The two rules cancel each other. `robots.txt` controls **crawling**: the crawler is not allowed to fetch the page, so it never reads the `noindex`. And a disallowed URL can stay in the index if other pages link to it.

Remove the `Disallow` and keep the `noindex`, so the crawler can fetch the page and see the rule. For an urgent case, Search Console has a temporary removal tool. If the page should not exist at all, return `404` or `410`, or redirect it.

</details>

## 3. Preview deployments in Google

Search results show pages from `feature-x-yourapp.vercel.app` and other [preview deployments](/delivery/ci-cd/#pipeline-design-choices) (separate deployments for reviewing a change, each with its own URL). What are your options?

<details>
<summary>Answer</summary>

Previews are public URLs, and crawlers find them through links in pull requests, chats or shared screenshots.

Options:

- **Authentication** on previews (platform protection or a password): crawlers can't fetch anything. It also hides unreleased work, but every reviewer needs access.
- **`X-Robots-Tag: noindex`** on every non-production response. Some platforms add it automatically; check that yours does.

A `Disallow: /` in the preview `robots.txt` is weaker: it stops crawling but doesn't remove pages that are already indexed, for the same reason as in question 2.

</details>

## 4. Hiding the admin panel

A developer adds `Disallow: /admin-7f3a/` to `robots.txt` "so nobody finds the admin panel". What is wrong with this?

<details>
<summary>Answer</summary>

`robots.txt` is a **public file** and a **request, not a lock**. Anyone can read it, so the line advertises exactly the path it tries to hide, and bad crawlers ignore it anyway.

Protect the admin panel with [authentication and authorization](/security/auth/). If you also want it out of search, add `noindex`, but that is about search results, not security.

</details>

## 5. Which site needs a manifest?

You have two projects: a marketing site for a conference, and an internal dashboard that the operations team opens many times a day. Which one should get a web app manifest, and what does it give them?

<details>
<summary>Answer</summary>

The **dashboard**. People return to it daily, so being able to install it with its own icon, name and window (`display: standalone`) is useful. The manifest gives the installed app its identity, and in some browsers lets the browser offer installation.

The conference site needs favicons, a `robots.txt` and a sitemap, but a manifest adds little: people visit it a few times. Note that the manifest doesn't make the dashboard work offline; that needs a [service worker](/web-platform/offline-and-storage/#service-workers-a-proxy-in-the-browser) (a background script that can intercept the site's requests) with a [caching](/architecture/caching/) strategy, which is a separate decision.

</details>
