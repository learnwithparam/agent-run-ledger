---
id: "3"
route: question
title: Show what a thousand tokens costs on each run
paths:
  - apps/console/app/page.tsx
doneWhen: The table shows a rate the reader can compare between runs, computed wherever this repository says derived numbers belong, and the console suite passes.
---

Cost and tokens are both in the runs table, but comparing two runs means dividing one by the other
in your head. A run that spent more because it did more is not the same as a run that spent more per
unit of work, and the table cannot currently tell them apart.

Add a rate the reader can compare.
