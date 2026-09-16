---
id: "5"
route: refused
title: Warn earlier when spend is heading for the limit
paths:
  - services/budget/src/lib.rs
doneWhen: A person decides this one.
---

The warning state starts at eighty percent of the limit, which on a busy month leaves almost no
time to react before the budget is breached. Move the threshold earlier.
