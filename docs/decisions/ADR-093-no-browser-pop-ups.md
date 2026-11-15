# ADR-093 No browser pop-ups

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: none

## Context

Four pages use browser pop-ups (alert, confirm): settings.html 27, commissary.html 5,
stock-receipts.html 5, sales.html 1. They look out of place on a phone, and a pop-up stops Claude in
Chrome until someone clicks it, so every click-through has to work around them.

## Decision

- Pages never call alert, confirm or prompt. A save or an error shows as a message line in the page
  (as the count pages do); a delete asks "Are you sure?" with Yes and No in the page.
- ui-conventions gains the rule.

## Why

It reads better on a phone and keeps every page checkable by Claude in Chrome.

## Consequences

Planned step no-popups, after cost-guard and supply-tags (settings.html is shared).

## Reopen only if

A native app replaces the web pages.

## Sources

Beta smoke list 2026-11-15 (Claude in Chrome replaced alert to read a refusal); architect chat
2026-11-15.
