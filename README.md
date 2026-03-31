# CPU Scheduling Simulator

A modern, interactive CPU scheduling algorithm simulator with multi-core support and Gantt chart visualization. Part of the [NC Suite](https://nc.arose-niazi.me/).

🔗 **Live:** [nc.arose-niazi.me/scheduling/](https://nc.arose-niazi.me/scheduling/)

## Features

- **FCFS** — First Come First Served
- **SJF** — Shortest Job First (non-preemptive & preemptive/SRTF)
- **Priority Scheduling** — Non-preemptive & preemptive
- **Round Robin** — Configurable quantum time
- **Multi-core support** — 1–16 configurable cores
- **Gantt Chart** — Visual timeline per core with tooltips
- **Results table** — Completion, turnaround, waiting, response times
- **Compare mode** — Run two algorithms on the same input
- **Dark/light theme**, responsive design, print-friendly
- **Share links** — Encode full state in URL
- **History** — Local storage history of past simulations

## Tech Stack

Vanilla HTML/CSS/JS — no frameworks, no build step.

## Docker

```bash
docker compose up -d
```

## Author

[Arose Niazi](https://arose-niazi.me)
