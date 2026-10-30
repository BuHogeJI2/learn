---
title: Authentication and authorization — check yourself
description: Scenario questions about sessions, tokens, OIDC and permission checks.
quizFor: security/auth
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Someone else's invoice

A customer reports that after changing `/invoices/1042` to `/invoices/1043` in the address bar, they saw another company's invoice. The endpoint requires login. What is the bug, and how do you prevent this class of bugs?

<details>
<summary>Answer</summary>

The server checks **authentication** (is someone logged in) but not **authorization** for the specific object (does invoice 1043 belong to this user's company). This is IDOR (insecure direct object reference: access to an object just by changing its ID), part of broken access control, the first item of the OWASP Top 10. In a multi-tenant app (many customer companies, called tenants, in one system) it also leaks data between customers.

Fix this endpoint, then make the check hard to forget: a shared policy layer that every handler calls (`can(user, 'read', invoice)`), data-access functions that always filter by tenant, and tests that call endpoints as the wrong user and expect `403` or `404`. Random IDs (UUIDs) make guessing harder but are not a fix; the check is.

</details>

## 2. Hidden buttons

Non-admin users don't see the "Delete project" button. A reviewer asks where the server checks the role, and the developer answers: "They can't click a button they can't see." What is wrong?

<details>
<summary>Answer</summary>

Hiding a button is **UX, not security**. Anyone can call the endpoint directly with `curl`, the browser console or a modified request. The UI only reflects permissions; the server must check them on every request.

Check the permission in the endpoint (and in every other entry point that can delete a project: [GraphQL](/architecture/api-styles/) mutations, [server functions](/tools/react/server-components/#server-functions-the-other-direction), [background jobs](/architecture/background-jobs/)). Keep the UI check too, so users don't see actions they can't do, but treat it as a convenience.

</details>

## 3. A stolen laptop

The app uses JWTs (self-contained tokens, signed by the server, that carry the user ID and an expiry) that live 30 days, stored in a cookie. A user reports a stolen laptop and clicks "Log out of all devices", but the laptop's session keeps working. Why, and how would you redesign it?

<details>
<summary>Answer</summary>

A self-contained token is valid until it **expires**. The server checks its signature and claims, including the expiry, but keeps no session record, so it has nothing to delete: "log out" removes the browser's copy, not the thief's.

Options:

- **Server-side sessions**: the cookie holds a random session ID, and the server looks it up on each request. Revocation is deleting the record. The cost is one fast lookup per request.
- **Short-lived access tokens** (the tokens an API accepts, living minutes) plus **rotating refresh tokens** (long-lived tokens used only to get new access tokens, replaced on every use), tracked on the server. Logout everywhere revokes the refresh tokens; the access token dies within minutes.
- A **revocation list** checked on each request, which brings the lookup back anyway.

For your own web app and backend, server-side sessions are usually the simplest choice that meets the requirement.

</details>

## 4. "Sign in with Google" and company SSO

You are building a B2B product: a React app with your own backend. Small customers want "Sign in with Google", large ones want SSO (single sign-on) through their company identity provider (the service that logs their employees in, such as Okta or Entra ID). How do you design login?

<details>
<summary>Answer</summary>

Use **[OpenID Connect](/security/auth/#oauth-2-and-openid-connect)** (OIDC, the standard login protocol on top of OAuth; add SAML, an older enterprise standard, where a customer requires it) through a hosted provider or a mature library, rather than writing it yourself. Use the Authorization Code flow with PKCE (a check that the app finishing the login is the one that started it), finished on **your backend**: it validates the ID token (the provider's signed statement of who logged in) and then creates **your own session** with an `HttpOnly` cookie.

This way the browser never holds provider tokens, every login method ends in the same kind of session, and revocation works the same way for all customers. Authorization rules (who may do what in a customer's account) stay in your code: they are your business logic, not the identity provider's. The trade-off of a hosted provider is cost per user and a dependency on a vendor, against months of security-critical work.

</details>

## 5. The ID token as an API key

After "Sign in with Google", the SPA (a single-page app running in the browser) sends the Google **ID token** to your API in the `Authorization` header, and the API accepts any valid Google ID token. What is wrong with this?

<details>
<summary>Answer</summary>

The **ID token is for the client**: it tells your app who logged in. It is not an access token for your API. Its audience is the app that requested it, so an API that accepts "any valid Google ID token" may accept a token issued for **someone else's app**, and the API can't revoke it or limit what it allows.

Validate the ID token once, on your backend, at login (signature, issuer, audience, expiry), and then create your own session (or issue your own access tokens). The API checks your credential, not Google's identity proof.

</details>
