---
title: Accessibility
description: How semantic HTML becomes the accessibility tree, why keyboard and focus decide whether a page can be used, and what automated checks can't see.
related:
  - web-platform/page-loading
  - architecture/testing
  - tools/react/suspense
officialDocs:
  - title: W3C — WCAG overview
    url: https://www.w3.org/WAI/standards-guidelines/wcag/
  - title: W3C — WCAG 2.2 Quick Reference
    url: https://www.w3.org/WAI/WCAG22/quickref/
  - title: W3C — ARIA Authoring Practices Guide
    url: https://www.w3.org/WAI/ARIA/apg/
  - title: MDN — Accessibility
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility
  - title: MDN — Accessibility tree
    url: https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree
  - title: web.dev — Learn Accessibility
    url: https://web.dev/learn/accessibility
---

## What problem it solves

Many people don't use a page the way its author does. Some can't see the screen and listen to a **screen reader** (software that reads the interface aloud). Some can't use a mouse and work with a keyboard, a switch or voice control. Some zoom the page to 200% or more, can't tell red from green, or are made ill by large animations. And everyone is sometimes in that position: a broken trackpad, bright sunlight, one free hand.

**Accessibility** means the product can be used in all these ways. It is a design and engineering property, like performance: cheap when it is built in, and expensive when it is added at the end. In many countries it is also a legal requirement, and the common reference is WCAG (the Web Content Accessibility Guidelines, described below); check with a lawyer what applies to your product.

## Mental model: the page has a second tree

The browser builds more than the DOM. From it, the browser derives the **accessibility tree**: a simplified tree where each node has what assistive technology needs. **Assistive technology** is software or hardware that helps people use a computer, such as a screen reader or a switch.

```
HTML                                    accessibility tree
<nav aria-label="Main">                 navigation "Main"
  <a href="/cart">Cart (2)</a>            link "Cart (2)"
</nav>
<button disabled>Pay</button>           button "Pay", disabled
<div class="btn" onclick="pay()">Pay</div>   generic → just the text "Pay"
```

Each node answers three questions:

- **Role**: what is it? (button, link, heading, checkbox)
- **Name**: what is it called? (from its text, its `<label>`, `alt`, or `aria-label`)
- **State**: what condition is it in? (checked, expanded, disabled, invalid)

The last row shows the whole problem. The `div` looks like a button and works with a mouse, but in the accessibility tree it is plain text. A screen reader doesn't announce a button, the Tab key skips it, and Enter does nothing.

You can see this tree in the browser: the Accessibility panel in Chrome DevTools or the Firefox Accessibility Inspector.

## Semantic HTML does most of the work

Native elements come with role, name, state, focus and keyboard behavior for free.

| You need | Use | You get for free |
| --- | --- | --- |
| An action | `<button>` | Focus, Enter and Space, a role, disabled state |
| Navigation to a URL | `<a href>` | Focus, Enter, open in new tab, a place in history |
| A text field | `<input>` with `<label>` | A name, a bigger click area, autofill |
| Page structure | `<header>`, `<nav>`, `<main>`, `<footer>` | Landmarks that users can jump between |
| Document outline | `<h1>`–`<h6>` in order | Screen reader users move through a page by headings |
| A modal dialog | `<dialog>` with `showModal()` | Focus moved inside, Escape to close, the rest of the page made inert (unreachable) |
| A list of options | `<select>`, radio buttons | Keyboard handling and platform behavior |

Choosing `<a>` or `<button>` is a real decision: a link goes somewhere, a button does something. This also matters for [HTTP](/web-platform/http/#methods-what-a-request-promises): an action behind a link is the same mistake in another layer.

**ARIA** (Accessible Rich Internet Applications) is a set of attributes that change what the accessibility tree says: `role`, `aria-label`, `aria-expanded` and others. It changes only the description. `role="button"` doesn't add focus or keyboard handling; you have to write those yourself. Hence the first rule of ARIA: **if a native element does the job, use it**. Wrong ARIA is worse than none, because it tells users something false.

ARIA is needed for what HTML doesn't have: tabs, comboboxes, tree views. The ARIA Authoring Practices Guide describes the expected keyboard behavior for each, and it is more work than it looks.

## Keyboard and focus

Everything that works with a mouse must work with a keyboard. Keyboard use is also the base for switch devices and voice control.

- **Tab order follows the DOM.** If CSS moves things around visually, focus jumps around. Keep DOM order and visual order the same.
- **Focus must be visible.** `outline: none` without a replacement makes the keyboard unusable. `:focus-visible` lets the browser decide when a ring is useful: always with a keyboard, and usually not when a button is clicked with a mouse.
- **Only interactive elements belong in the Tab order.** `tabindex="0"` adds an element to the order, and positive values break it. `tabindex="-1"` keeps an element out of the order but lets your code focus it, which suits a heading after a route change or an error summary.
- **You own focus when you change the page.** The browser moves focus only on a full page load. In an app, your code decides:
  - when a dialog opens, focus goes inside; when it closes, focus returns to the button that opened it;
  - when an element with focus is removed (a deleted row), focus must go to a sensible place, or it falls back to the top of the page;
  - after a client-side route change, move focus to the new page's heading or main region, and announce it. Frameworks do this to different degrees, so check yours.
- **Skip links** ("Skip to content") let keyboard users jump past the navigation.
- **Hidden means hidden for everyone.** `display: none` removes content from the accessibility tree and from focus. An element that is only transparent or moved off screen can still receive focus. The `inert` attribute makes a whole part of the page unreachable, which is useful behind a custom overlay.

## Dynamic content

A visual update says nothing to someone who can't see it. **Live regions** (`aria-live="polite"`, `role="status"`, `role="alert"`) make screen readers announce changes inside them: "3 results found", "Saved", "Payment failed". For ordinary live regions, the reliable way is that the region already exists in the DOM before its text changes; `role="alert"` has special handling, so test it. Use them sparingly, because each announcement interrupts or queues.

- **Loading**: a [Suspense](/tools/react/suspense/) fallback (loading placeholder) or a spinner is silent by default. Announce the state where waiting matters.
- **Forms**: link errors to their field with `aria-describedby`, mark the field with `aria-invalid`, and don't rely on color alone. On submit, move focus to the first error or to a summary.
- **Infinite scroll and toasts**: content that disappears on a timer or moves as you read needs a way to pause it or find it again.

## Beyond screen readers

- **Contrast.** WCAG level AA asks for 4.5:1 for normal text, 3:1 for large text and for interface elements such as an input's border.
- **Color alone** must not carry meaning. An error needs an icon or text too.
- **Zoom and reflow.** Text must work at 200%, and content must fit a viewport 320 CSS pixels wide without scrolling in two directions, except for content that needs two dimensions, such as maps and data tables. Use `rem` and don't disable zoom in the viewport meta tag.
- **Target size.** WCAG 2.2 AA asks for at least 24 × 24 CSS pixels, with some exceptions.
- **Dragging.** Anything done by dragging needs a single-pointer alternative, such as buttons to move an item.
- **Motion.** Respect `prefers-reduced-motion`; large movement can cause nausea, and flashing can cause seizures.
- **Text alternatives.** Every meaningful image needs `alt`. A decorative one needs an empty `alt=""`, so that it is skipped.
- **Language.** Set `lang` on `<html>`, so that screen readers use the right pronunciation.
- **Plain language and clear labels** help everyone, including people with cognitive disabilities and non-native speakers.

## WCAG: what the levels mean

**WCAG** (Web Content Accessibility Guidelines) is the W3C standard. The current Recommendation is **WCAG 2.2**; WCAG 3 is still a Working Draft and doesn't replace it. It is built on four principles: content must be **perceivable**, **operable**, **understandable** and **robust**. Each testable requirement (a success criterion) has a level:

| Level | Meaning |
| --- | --- |
| **A** | The minimum; without it, some people can't use the page at all |
| **AA** | The usual target, and what most laws and contracts refer to |
| **AAA** | The strictest; not expected for whole sites, because some criteria can't be met for all content |

## What tools can and cannot check

Automated tools read the DOM and find rule violations. They are fast and belong in [CI](/delivery/ci-cd/) (the automatic checks on every change), but they cover only part of the problem.

| Tools can check | Only a person can check |
| --- | --- |
| Missing `alt`, labels and names | Whether the `alt` text is useful |
| Contrast of plain text on a plain background | Contrast on images and gradients |
| Invalid ARIA | Whether the ARIA matches the behavior |
| Duplicate IDs, heading structure | Whether the headings make sense |
| Elements that can't be reached by some rules | Whether the whole flow works with a keyboard, in a sensible order |

A passing score means the checks found nothing, not that the page is accessible.

A practical routine for each feature:

1. **Tab through it** without a mouse. Can you reach everything, see where you are, and get out of every dialog?
2. **Zoom to 200%** and narrow the window.
3. **Run an automated check** in the browser and in CI.
4. **Try a screen reader** on the main flow: VoiceOver on macOS and iOS, NVDA on Windows, TalkBack on Android. They behave differently, so test on what your users have.
5. **Test with disabled people** for important products. Nothing else finds the real problems as well.

[Tests](/architecture/testing/#test-behavior-not-implementation) that query elements by role and name fail when a control loses its accessible name, so they catch part of this for free.

## Typical failures

- **`<div onClick>` as a button.** It works with a mouse only and is invisible to screen readers.
- **Placeholder instead of a label.** It disappears on typing, and it often has poor contrast.
- **Icon buttons with no name.** A screen reader says "button", and nothing else.
- **`outline: none`** with nothing in its place.
- **Modals that don't manage focus**: focus stays behind the overlay, and Tab walks through the hidden page.
- **Client-side navigation with no announcement.** The URL and content change, and a screen reader user hears nothing.
- **ARIA added to patch a `div`** instead of using the native element.
- **`aria-hidden="true"` on something that can get focus.** Keyboard users land on an element that doesn't exist for their screen reader.
- **Overlay widgets that promise instant compliance.** They don't fix the underlying HTML and can get in the way of assistive technology.
- **Accessibility as a last step**, when every fix means changing the design.

## When to invest

- **Public products and anything for employees or the public sector:** build to WCAG 2.2 AA from the start. Check what your country's law requires.
- **Design systems:** the highest return. One accessible button or dialog fixes every screen that uses it.
- **Complex widgets:** use a tested library before you write your own combobox.
- **Existing products:** start with the main journeys (sign-in, checkout) and with keyboard use, then work outward.

## Landscape

- **Automated checks:** axe (axe-core, axe DevTools), Lighthouse, Pa11y, WAVE; eslint-plugin-jsx-a11y for JSX.
- **In tests:** `getByRole` in Testing Library, jest-axe and vitest-axe, `@axe-core/playwright`.
- **Screen readers:** VoiceOver, NVDA, JAWS, TalkBack, Narrator.
- **Accessible component primitives:** React Aria, Radix UI, Headless UI, Ariakit, Base UI.
- **Reference:** WCAG 2.2 Quick Reference, ARIA Authoring Practices Guide, MDN, The A11Y Project.
