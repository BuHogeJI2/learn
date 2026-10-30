---
title: Authentication and authorization
description: Who the user is and what they may do — sessions and tokens, where credentials live in the browser, permission checks, and where OAuth and OpenID Connect fit.
related:
  - security/web-attacks
  - security/browser-boundaries
  - web-platform/http
  - architecture/application-boundaries
officialDocs:
  - title: OWASP — Authentication Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  - title: OWASP — Session Management Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
  - title: OWASP — Authorization Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
  - title: RFC 9700 — OAuth 2.0 Security Best Current Practice
    url: https://www.rfc-editor.org/rfc/rfc9700
  - title: RFC 10017 — OAuth 2.0 for Browser-Based Applications
    url: https://www.rfc-editor.org/rfc/rfc10017.html
  - title: OpenID Foundation — How OpenID Connect works
    url: https://openid.net/developers/how-connect-works/
  - title: MDN — Web Authentication API (passkeys)
    url: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API
---

## What problem it solves

Two different questions, always asked separately:

- **Authentication** (authN): *who* is making this request?
- **Authorization** (authZ): may *this* user do *this* action on *this* object?

HTTP is [stateless](/web-platform/http/#mental-model-a-message-with-three-parts): the server doesn't remember that you logged in a minute ago. So login must produce a **credential** (proof of identity), and every later request must carry it.

Mixing the two questions causes the most common security bug on the web: the server checks that the user is logged in, but not that the order `/orders/43` belongs to them.

## Mental model: a credential, checked on every request

```
1. Login         the user proves who they are       → the server issues a credential
                 (password, passkey, Google…)
2. Each request  the browser sends the credential   → server: who is it?           (authN)
                 (cookie or header)
3. Each action   the server applies the rules for   → allow, or 403                 (authZ)
                 this user and this object
4. End           logout, expiry, revocation          → the credential stops working
```

The credential can have two forms:

- **Reference (session ID)**: a long random string. The server keeps the real data (user ID, expiry) in a **session store** and looks it up on each request. Revocation is easy: delete the record. The cost is one lookup per request, which is cheap with a fast store such as Redis.
- **Self-contained token**, usually a **JWT** (JSON Web Token: JSON with the user ID, expiry and other **claims** (statements about the user), signed by the issuer). The server checks the signature and needs no lookup. But a token stays valid until it expires, so revocation is hard. The usual answer is a short lifetime plus a **refresh token** (a long-lived credential used only to get new short-lived tokens), or a revocation list, which brings the lookup back.

How the credential travels is a **separate decision**: a cookie or an `Authorization` header. A JWT can live in a cookie; a session ID can be sent in a header. "Sessions or JWT" and "cookie or [`localStorage`](/web-platform/offline-and-storage/#storage-options)" are two different questions that are often mixed up.

| | In an `HttpOnly` cookie | In an `Authorization` header (your code holds it) |
| --- | --- | --- |
| **Session ID** | The classic web app: simple, easy to revoke | Mobile apps, API clients |
| **JWT** | Works; watch the cookie size; still needs CSRF defense | Typical SPA calling an API; third-party APIs |

## How users prove who they are

- **Passwords.** The server stores only a slow, salted hash (Argon2id, bcrypt), limits login attempts and rejects known leaked passwords. The frontend's job: let password managers work (correct `autocomplete` attributes, no blocked paste).
- **MFA** (multi-factor authentication: a second proof from something else the user has): authenticator app codes, security keys, push approvals. SMS codes are the weakest option, because phone numbers can be hijacked.
- **Passkeys** (built on WebAuthn): the device or password manager keeps a private key, and the server stores only the public key. They resist phishing, because the browser uses a passkey only on the domain it was created for. This is the direction the industry is moving.
- **Magic links and one-time codes** sent by email.
- **Login with another account** ("Sign in with Google") and **company SSO** (single sign-on: one login for many apps): through OpenID Connect or the older SAML, described below.

## Sessions in practice: the lifecycle

A credential has a life, and each stage has its own rules:

- **Creation.** Issue a **new** session ID at login, never reuse one that existed before login. Otherwise an attacker who planted a known ID (session fixation) is logged in too.
- **Transport.** A cookie with `HttpOnly`, `Secure`, `SameSite=Lax` and the `__Host-` prefix (see [cookies and boundaries](/security/browser-boundaries/#when-the-browser-sends-cookies)).
- **Expiry.** An idle timeout (no activity for N minutes) plus an absolute limit (log in again after N days).
- **Revocation.** Logout deletes the session **on the server**, not only the cookie. "Log out of all devices" and a password change end the other sessions.
- **Step-up.** Sensitive actions (changing the email, a payment) ask for the password or passkey again.

Tokens follow the same stages: short-lived access tokens (the tokens an API accepts on each request; they live minutes), and refresh tokens that are **rotated** on every use, so a stolen, already-used refresh token is detected.

## Where the browser keeps credentials

| Place | Survives reload | Readable by injected script | Sent automatically | Notes |
| --- | --- | --- | --- | --- |
| **`HttpOnly` cookie** | Yes | No (but injected code can still *use* it while the page is open) | Yes | Needs [CSRF defense](/security/web-attacks/#csrf-requests-the-user-didnt-mean). The server sees it on the page request, so [server rendering](/architecture/rendering/) knows the user. |
| **`localStorage` / `sessionStorage`** | Yes / per tab | **Yes**: XSS or a third-party script can copy it and use it from anywhere until it expires | No | No CSRF, but token theft is easy |
| **Memory** (a JavaScript variable) | No | Harder to copy, but injected code can use it in the page | No | Needs a way to get a new token after reload, for example from an endpoint of your own backend that keeps the refresh token or session in an `HttpOnly` cookie |
| **Server-side, behind a BFF** | — | The browser never sees the tokens | Only the session cookie | The safest option for browser apps; see below |

**BFF** (backend for frontend: a server layer owned by the frontend; see [application boundaries](/architecture/application-boundaries/#where-the-frontend-fits-bff-gateway-micro-frontends)): the browser talks only to your own server with a session cookie. The server keeps the OAuth tokens and calls the APIs. RFC 10017, the IETF guidance for browser-based apps, strongly recommends this pattern for business apps and apps that handle personal data.

For your own web app with your own backend, the sensible default is an **`HttpOnly` session cookie to a same-origin backend**. Tokens held by JavaScript make sense mainly for calling third-party APIs directly and for non-browser clients.

## Authorization: checking what is allowed

- **On the server, on every request, for the specific object.** "Is this user allowed to edit *this* document?", not only "is this user logged in?".
- **The UI only reflects permissions.** Hiding a button is UX, not security; the endpoint behind it must check again.
- **Every entry point checks**: REST endpoints, GraphQL resolvers (field by field, see [API styles](/architecture/api-styles/#how-they-compare)), framework server functions, webhooks, [background jobs](/architecture/background-jobs/).

The missing object check has a name: **IDOR** (insecure direct object reference). Broken access control, the category it belongs to, is the first item of the OWASP Top 10.

Common models for writing the rules:

| Model | Rule looks like | Good for |
| --- | --- | --- |
| **RBAC** (role-based) | "Editors may publish" | Simple products, admin panels |
| **ABAC** (attribute-based, or policy-based) | "Users may edit documents of their own department during work hours" | Rules that depend on data |
| **ReBAC** (relationship-based) | "May view if member of a team that owns the folder that contains the file" | Sharing, as in Google Drive or GitHub |

In multi-tenant apps (many customer companies in one system), every query must also be limited to the user's tenant. One forgotten filter leaks another company's data.

Where the rules live: in each handler, in a shared policy layer of the app, or in a separate authorization service. An [API gateway](/architecture/application-boundaries/#where-the-frontend-fits-bff-gateway-micro-frontends) (a shared entry point in front of services) can check "is there a valid credential?" for everyone, but object-level rules need the data, so they stay close to it.

## OAuth 2 and OpenID Connect

- **OAuth 2.0** lets an app get **access to an API on behalf of a user**, without the user's password: "let this app read my GitHub repositories". The result is an **access token**. OAuth is about delegated access, not login.
- **OpenID Connect** (OIDC) adds **identity** on top of OAuth: an **ID token** (a JWT that says who the user is). This is what "Sign in with Google" and most company SSO use.

The parties: the **user**, the **client** (your app), the **authorization server** or **identity provider** (Google, Okta, Auth0, Keycloak) and the **resource server** (the API).

The recommended flow is **Authorization Code with PKCE**:

```
App ── redirect ──────────────────► Identity provider: login + consent
App ◄── redirect back with ?code=… ─ (short-lived, single-use code)
App backend ── code + PKCE verifier ──► token endpoint
App backend ◄── ID token (who) + access token (what it may call) + refresh token
App backend checks the callback belongs to this login, validates the ID token
App backend creates its OWN session → cookie to the browser
```

- **Before trusting the result**, the app checks that the callback (the redirect back from the provider) belongs to the login it started (PKCE, plus `state` or `nonce` where used) and validates the ID token: signature, issuer, audience and expiry. A good library does this; never skip it.
- **PKCE** (Proof Key for Code Exchange) proves that the app finishing the flow is the one that started it, so a stolen code is useless. It is recommended for all clients and required for apps that can't keep a secret (SPAs, mobile apps).
- The old **implicit flow**, which put tokens directly in the URL, is deprecated.
- Most apps use OIDC only to **learn who the user is**, then create their own session. They don't use the provider's tokens as their session.
- The **ID token is for the client**, to learn who logged in. The **access token is for the API**. Don't send an ID token to an API as proof of access.

## Typical failures

- **Authentication without authorization**: any logged-in user can read any object by changing an ID.
- **Authorization only in the UI.**
- **Long-lived JWTs with no way to revoke them**, and a "logout" that only deletes the browser's copy.
- **JWT verification mistakes**: accepting `alg: none`, not checking expiry, issuer and audience, or treating a JWT as secret. A signed JWT is not encrypted; anyone can decode the payload.
- **Tokens in `localStorage`** on a site with many third-party scripts.
- **Session ID not renewed at login**, or sessions that never expire.
- **Different rules in different services**, each implemented slightly differently.
- **Home-made password storage or crypto** instead of proven libraries or providers.
- **Login and password reset without [rate limits](/architecture/reliability/#protecting-a-service-from-overload)** (caps on how many attempts a client may make), which invites credential stuffing (trying passwords leaked from other sites), and messages that reveal whether an account exists.

## How to choose

- **Your own web app and backend:** server-side sessions with an `HttpOnly` cookie. Simple and revocable.
- **Login with existing accounts or company SSO:** OIDC through a provider or a library, then your own session.
- **SPA plus an API on another domain:** prefer a BFF or a same-origin API with a cookie. Otherwise, short-lived access tokens in memory. To refresh them, either an endpoint of your own backend keeps the refresh token in an `HttpOnly` cookie and hands out new access tokens (a token-mediating backend; that endpoint still needs CSRF defense), or the SPA acts as a pure OAuth client and handles rotating refresh tokens itself, which is the least protected option.
- **Mobile apps, CLIs, server-to-server:** tokens in the `Authorization` header (server-to-server: the OAuth client credentials flow, or mutual TLS).
- **Other developers' apps acting for your users:** you become an OAuth provider; use an established implementation.
- **Build or buy:** authentication is security-critical and full of details. Hosted providers and mature libraries are the default; write the authorization rules yourself, because they are your business logic.

## Landscape

- **Hosted identity:** Auth0 (Okta), Clerk, Firebase Authentication, Supabase Auth, Amazon Cognito, Microsoft Entra ID, WorkOS (enterprise SSO). Self-hosted: Keycloak, Ory, Authentik, Zitadel.
- **Libraries:** Auth.js, Better Auth, Passport.js, built-in auth in Rails, Django, Laravel and ASP.NET; SimpleWebAuthn for passkeys.
- **Authorization:** CASL, Casbin, Open Policy Agent, Cerbos; OpenFGA and SpiceDB for relationship-based rules (in the style of Google's Zanzibar).
- **Standards:** OAuth 2.0 and the upcoming OAuth 2.1, OpenID Connect, SAML, WebAuthn and passkeys, JWT (RFC 7519), SCIM (syncing users from a company directory).
