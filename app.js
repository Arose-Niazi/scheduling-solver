/* ============================================================
   NC CPU Scheduling Simulator
   FCFS, SJF, Priority, Round Robin — Multi-Core + Gantt Chart
   ============================================================ */
(function () {
  'use strict';

  // ===== ALGORITHM LABELS =====
  var ALGO_NAMES = {
    'fcfs': 'First Come First Served (FCFS)',
    'sjf-np': 'Shortest Job First (Non-Preemptive)',
    'sjf-p': 'Shortest Job First (Preemptive / SRTF)',
    'priority-np': 'Priority Scheduling (Non-Preemptive)',
    'priority-p': 'Priority Scheduling (Preemptive)',
    'rr': 'Round Robin'
  };

  var PROCESS_COLORS = [
    'process-color-0','process-color-1','process-color-2','process-color-3',
    'process-color-4','process-color-5','process-color-6','process-color-7',
    'process-color-8','process-color-9','process-color-10','process-color-11'
  ];

  var COLOR_HEX = [
    '#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4',
    '#f97316','#ec4899','#14b8a6','#a855f7','#84cc16','#e11d48'
  ];

  // ===== SCHEDULING ALGORITHMS =====

  // Each algorithm returns: { timeline: [ [{ pid, label, start, end }, ...], ... per core ], processes: [...with CT, TAT, WT, RT] }

  function runFCFS(processes, numCores) {
    var sorted = processes.slice().sort(function(a, b) {
      return a.arrival - b.arrival || a.index - b.index;
    });
    return runNonPreemptive(sorted, numCores, function() { return 0; });
  }

  function runSJFNonPreemptive(processes, numCores) {
    return runNonPreemptiveReady(processes, numCores, function(a, b) {
      return a.burst - b.burst || a.arrival - b.arrival || a.index - b.index;
    });
  }

  function runPriorityNonPreemptive(processes, numCores) {
    return runNonPreemptiveReady(processes, numCores, function(a, b) {
      return a.priority - b.priority || a.arrival - b.arrival || a.index - b.index;
    });
  }

  // Generic non-preemptive with FCFS order (no re-sorting at each time)
  function runNonPreemptive(sorted, numCores, sortKey) {
    var n = sorted.length;
    var coreEnd = new Array(numCores).fill(0);
    var timeline = [];
    for (var c = 0; c < numCores; c++) timeline.push([]);
    var results = {};

    for (var i = 0; i < n; i++) {
      var p = sorted[i];
      // Find earliest free core
      var minCore = 0;
      for (var c2 = 1; c2 < numCores; c2++) {
        if (coreEnd[c2] < coreEnd[minCore]) minCore = c2;
      }
      var start = Math.max(coreEnd[minCore], p.arrival);
      var end = start + p.burst;
      coreEnd[minCore] = end;

      timeline[minCore].push({ pid: p.index, label: p.label, start: start, end: end });
      results[p.index] = {
        label: p.label, arrival: p.arrival, burst: p.burst, priority: p.priority,
        ct: end, tat: end - p.arrival, wt: end - p.arrival - p.burst, rt: start - p.arrival
      };
    }

    return { timeline: timeline, results: processResultsArray(sorted, results) };
  }

  // Non-preemptive with ready queue re-sort at each decision point
  function runNonPreemptiveReady(processes, numCores, comparator) {
    var n = processes.length;
    var procs = processes.map(function(p) { return Object.assign({}, p); });
    var coreEnd = new Array(numCores).fill(0);
    var timeline = [];
    for (var c = 0; c < numCores; c++) timeline.push([]);
    var scheduled = new Array(n).fill(false);
    var results = {};
    var completed = 0;

    while (completed < n) {
      // Find earliest available core
      var minCoreTime = Infinity, minCore = 0;
      for (var c2 = 0; c2 < numCores; c2++) {
        if (coreEnd[c2] < minCoreTime) { minCoreTime = coreEnd[c2]; minCore = c2; }
      }

      // Get ready processes
      var ready = [];
      for (var i = 0; i < n; i++) {
        if (!scheduled[i] && procs[i].arrival <= minCoreTime) {
          ready.push(procs[i]);
        }
      }

      if (ready.length === 0) {
        // Advance time to next arrival
        var nextArr = Infinity;
        for (var i2 = 0; i2 < n; i2++) {
          if (!scheduled[i2] && procs[i2].arrival < nextArr) nextArr = procs[i2].arrival;
        }
        coreEnd[minCore] = nextArr;
        continue;
      }

      ready.sort(comparator);
      var p = ready[0];
      scheduled[p.index] = true;

      var start = Math.max(coreEnd[minCore], p.arrival);
      var end = start + p.burst;
      coreEnd[minCore] = end;

      timeline[minCore].push({ pid: p.index, label: p.label, start: start, end: end });
      results[p.index] = {
        label: p.label, arrival: p.arrival, burst: p.burst, priority: p.priority,
        ct: end, tat: end - p.arrival, wt: end - p.arrival - p.burst, rt: start - p.arrival
      };
      completed++;
    }

    return { timeline: timeline, results: processResultsArray(procs, results) };
  }

  // Preemptive SJF (SRTF)
  function runSRTF(processes, numCores) {
    return runPreemptive(processes, numCores, function(a, b) {
      return a.remaining - b.remaining || a.arrival - b.arrival || a.index - b.index;
    });
  }

  // Preemptive Priority
  function runPriorityPreemptive(processes, numCores) {
    return runPreemptive(processes, numCores, function(a, b) {
      return a.priority - b.priority || a.arrival - b.arrival || a.index - b.index;
    });
  }

  function runPreemptive(processes, numCores, comparator) {
    var n = processes.length;
    var procs = processes.map(function(p) {
      return { index: p.index, label: p.label, arrival: p.arrival, burst: p.burst, priority: p.priority, remaining: p.burst };
    });
    var timeline = [];
    for (var c = 0; c < numCores; c++) timeline.push([]);

    var coreRunning = new Array(numCores).fill(null); // index into procs
    var completed = 0;
    var firstResponse = {};
    var completionTime = {};
    var time = 0;
    var maxTime = 0;
    for (var i = 0; i < n; i++) maxTime += procs[i].burst;
    maxTime += Math.max.apply(null, procs.map(function(p) { return p.arrival; }));

    while (completed < n && time <= maxTime + n) {
      // Collect ready processes not yet completed
      var ready = [];
      for (var i2 = 0; i2 < n; i2++) {
        if (procs[i2].remaining > 0 && procs[i2].arrival <= time) {
          ready.push(procs[i2]);
        }
      }
      ready.sort(comparator);

      // Assign to cores
      var assigned = new Set();
      var newRunning = new Array(numCores).fill(null);

      for (var ri = 0; ri < ready.length && assigned.size < numCores; ri++) {
        var p = ready[ri];
        if (assigned.has(p.index)) continue;

        // Prefer core already running this process
        var targetCore = -1;
        for (var c2 = 0; c2 < numCores; c2++) {
          if (coreRunning[c2] === p.index && newRunning[c2] === null) { targetCore = c2; break; }
        }
        if (targetCore === -1) {
          for (var c3 = 0; c3 < numCores; c3++) {
            if (newRunning[c3] === null) { targetCore = c3; break; }
          }
        }
        if (targetCore !== -1) {
          newRunning[targetCore] = p.index;
          assigned.add(p.index);
        }
      }

      // Record timeline
      for (var c4 = 0; c4 < numCores; c4++) {
        var pid = newRunning[c4];
        var tl = timeline[c4];
        if (pid !== null) {
          if (!(pid in firstResponse)) firstResponse[pid] = time;
          var last = tl.length > 0 ? tl[tl.length - 1] : null;
          if (last && last.pid === pid && last.end === time) {
            last.end = time + 1;
          } else {
            tl.push({ pid: pid, label: procs[pid].label, start: time, end: time + 1 });
          }
          procs[pid].remaining--;
          if (procs[pid].remaining === 0) {
            completionTime[pid] = time + 1;
            completed++;
          }
        }
      }

      coreRunning = newRunning;
      time++;

      // If nothing ready and not done, advance to next arrival
      if (assigned.size === 0 && completed < n) {
        var nextArr = Infinity;
        for (var i3 = 0; i3 < n; i3++) {
          if (procs[i3].remaining > 0 && procs[i3].arrival > time) {
            nextArr = Math.min(nextArr, procs[i3].arrival);
          }
        }
        if (nextArr < Infinity) time = nextArr;
      }
    }

    var results = {};
    for (var i4 = 0; i4 < n; i4++) {
      var pp = procs[i4];
      var ct = completionTime[pp.index] || 0;
      results[pp.index] = {
        label: pp.label, arrival: pp.arrival, burst: pp.burst, priority: pp.priority,
        ct: ct, tat: ct - pp.arrival, wt: ct - pp.arrival - pp.burst,
        rt: (firstResponse[pp.index] !== undefined ? firstResponse[pp.index] : 0) - pp.arrival
      };
    }

    return { timeline: timeline, results: processResultsArray(procs, results) };
  }

  // Round Robin
  function runRoundRobin(processes, numCores, quantum) {
    var n = processes.length;
    var procs = processes.map(function(p) {
      return { index: p.index, label: p.label, arrival: p.arrival, burst: p.burst, priority: p.priority, remaining: p.burst };
    });

    var timeline = [];
    for (var c = 0; c < numCores; c++) timeline.push([]);

    var queue = [];
    var inQueue = new Set();
    var completed = 0;
    var firstResponse = {};
    var completionTime = {};
    var time = 0;

    // Sort by arrival for initial ordering
    var sorted = procs.slice().sort(function(a, b) { return a.arrival - b.arrival || a.index - b.index; });

    var coreState = [];
    for (var c2 = 0; c2 < numCores; c2++) {
      coreState.push({ pid: null, quantumLeft: 0 });
    }

    var maxTime = 0;
    for (var i = 0; i < n; i++) maxTime += procs[i].burst;
    maxTime += Math.max.apply(null, procs.map(function(p) { return p.arrival; })) + n;

    while (completed < n && time <= maxTime) {
      // Add newly arrived processes to queue
      for (var si = 0; si < sorted.length; si++) {
        var sp = sorted[si];
        if (sp.arrival <= time && sp.remaining > 0 && !inQueue.has(sp.index)) {
          // Check not currently running
          var running = false;
          for (var cc = 0; cc < numCores; cc++) {
            if (coreState[cc].pid === sp.index) { running = true; break; }
          }
          if (!running) {
            queue.push(sp.index);
            inQueue.add(sp.index);
          }
        }
      }

      // Check cores: if quantum expired or process done, release
      for (var c3 = 0; c3 < numCores; c3++) {
        var cs = coreState[c3];
        if (cs.pid !== null) {
          if (procs[cs.pid].remaining === 0) {
            completionTime[cs.pid] = time;
            completed++;
            cs.pid = null;
            cs.quantumLeft = 0;
          } else if (cs.quantumLeft === 0) {
            // Re-add newly arrived processes first (that arrived at this tick)
            for (var si2 = 0; si2 < sorted.length; si2++) {
              var sp2 = sorted[si2];
              if (sp2.arrival <= time && sp2.remaining > 0 && !inQueue.has(sp2.index)) {
                var stillRunning = false;
                for (var cc2 = 0; cc2 < numCores; cc2++) {
                  if (coreState[cc2].pid === sp2.index) { stillRunning = true; break; }
                }
                if (!stillRunning) {
                  queue.push(sp2.index);
                  inQueue.add(sp2.index);
                }
              }
            }
            // Put back in queue
            queue.push(cs.pid);
            inQueue.add(cs.pid);
            cs.pid = null;
            cs.quantumLeft = 0;
          }
        }
      }

      // Assign from queue to free cores
      for (var c4 = 0; c4 < numCores; c4++) {
        if (coreState[c4].pid === null && queue.length > 0) {
          var pid = queue.shift();
          inQueue.delete(pid);
          coreState[c4].pid = pid;
          coreState[c4].quantumLeft = quantum;
          if (!(pid in firstResponse)) firstResponse[pid] = time;
        }
      }

      // Execute one tick
      var anyWork = false;
      for (var c5 = 0; c5 < numCores; c5++) {
        var cs2 = coreState[c5];
        if (cs2.pid !== null) {
          anyWork = true;
          var tl = timeline[c5];
          var last = tl.length > 0 ? tl[tl.length - 1] : null;
          if (last && last.pid === cs2.pid && last.end === time) {
            last.end = time + 1;
          } else {
            tl.push({ pid: cs2.pid, label: procs[cs2.pid].label, start: time, end: time + 1 });
          }
          procs[cs2.pid].remaining--;
          cs2.quantumLeft--;
        }
      }

      time++;

      if (!anyWork && completed < n) {
        // Advance to next arrival
        var nextArr = Infinity;
        for (var i2 = 0; i2 < n; i2++) {
          if (procs[i2].remaining > 0 && procs[i2].arrival > time) {
            nextArr = Math.min(nextArr, procs[i2].arrival);
          }
        }
        if (nextArr < Infinity) time = nextArr;
        else break;
      }
    }

    // Handle any still running at end
    for (var c6 = 0; c6 < numCores; c6++) {
      if (coreState[c6].pid !== null && procs[coreState[c6].pid].remaining === 0) {
        completionTime[coreState[c6].pid] = time;
        completed++;
      }
    }

    var results = {};
    for (var i3 = 0; i3 < n; i3++) {
      var pp = procs[i3];
      var ct = completionTime[pp.index] || 0;
      results[pp.index] = {
        label: pp.label, arrival: pp.arrival, burst: pp.burst, priority: pp.priority,
        ct: ct, tat: ct - pp.arrival, wt: ct - pp.arrival - pp.burst,
        rt: (firstResponse[pp.index] !== undefined ? firstResponse[pp.index] : 0) - pp.arrival
      };
    }

    return { timeline: timeline, results: processResultsArray(procs, results) };
  }

  function processResultsArray(procs, resultsMap) {
    return procs.map(function(p) { return resultsMap[p.index]; })
      .sort(function(a, b) { return a.label.localeCompare(b.label); });
  }

  // ===== DISPATCHER =====
  function runAlgorithm(algo, processes, numCores, quantum) {
    switch (algo) {
      case 'fcfs': return runFCFS(processes, numCores);
      case 'sjf-np': return runSJFNonPreemptive(processes, numCores);
      case 'sjf-p': return runSRTF(processes, numCores);
      case 'priority-np': return runPriorityNonPreemptive(processes, numCores);
      case 'priority-p': return runPriorityPreemptive(processes, numCores);
      case 'rr': return runRoundRobin(processes, numCores, quantum);
      default: throw new Error('Unknown algorithm: ' + algo);
    }
  }

  // ===== RENDERING =====

  function renderGanttChart(timeline, processColorMap, maxTime) {
    if (maxTime === 0) maxTime = 1;
    var pixelsPerUnit = Math.max(30, Math.min(60, 800 / maxTime));
    var totalWidth = maxTime * pixelsPerUnit;

    var html = '<div class="gantt-wrapper"><div class="gantt-chart" style="min-width:' + (totalWidth + 80) + 'px;">';

    for (var c = 0; c < timeline.length; c++) {
      html += '<div class="gantt-row">';
      html += '<div class="gantt-label">Core ' + c + '</div>';
      html += '<div class="gantt-bar-area" style="width:' + totalWidth + 'px;position:relative;">';

      var blocks = timeline[c];
      var lastEnd = 0;

      for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];
        // Idle gap
        if (block.start > lastEnd) {
          var idleW = (block.start - lastEnd) * pixelsPerUnit;
          html += '<div class="gantt-block idle" style="width:' + idleW + 'px;left:' + (lastEnd * pixelsPerUnit) + 'px;position:absolute;">';
          html += 'idle</div>';
        }
        var w = (block.end - block.start) * pixelsPerUnit;
        var colorClass = processColorMap[block.pid] || 'process-color-0';
        html += '<div class="gantt-block ' + colorClass + '" style="width:' + w + 'px;left:' + (block.start * pixelsPerUnit) + 'px;position:absolute;">';
        html += block.label;
        html += '<span class="gantt-tooltip">' + block.label + ' [' + block.start + '–' + block.end + ']</span>';
        html += '</div>';
        lastEnd = block.end;
      }

      html += '</div></div>';
    }

    // Timeline ticks
    html += '<div class="gantt-timeline" style="width:' + totalWidth + 'px;height:20px;position:relative;margin-left:70px;">';
    var step = maxTime <= 20 ? 1 : maxTime <= 50 ? 2 : maxTime <= 100 ? 5 : 10;
    for (var t = 0; t <= maxTime; t += step) {
      html += '<span class="gantt-tick" style="left:' + (t * pixelsPerUnit) + 'px;">' + t + '</span>';
    }
    html += '</div>';

    html += '</div></div>';
    return html;
  }

  function renderResultsTable(results, processColorMap) {
    var html = '<div class="results-table-wrapper"><table class="results-table">';
    html += '<thead><tr><th>Process</th><th>Arrival</th><th>Burst</th><th>Priority</th>';
    html += '<th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th></tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var colorClass = processColorMap[r.label] || 'process-color-0';
      var colorHex = COLOR_HEX[PROCESS_COLORS.indexOf(colorClass)] || '#6366f1';
      html += '<tr>';
      html += '<td><div class="process-label-cell"><span class="process-dot" style="background:' + colorHex + '"></span>' + escapeHTML(r.label) + '</div></td>';
      html += '<td>' + r.arrival + '</td>';
      html += '<td>' + r.burst + '</td>';
      html += '<td>' + r.priority + '</td>';
      html += '<td>' + r.ct + '</td>';
      html += '<td>' + r.tat + '</td>';
      html += '<td>' + r.wt + '</td>';
      html += '<td>' + r.rt + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
  }

  function renderAverages(results) {
    var n = results.length;
    var sumTAT = 0, sumWT = 0, sumRT = 0, sumCT = 0;
    for (var i = 0; i < n; i++) {
      sumTAT += results[i].tat;
      sumWT += results[i].wt;
      sumRT += results[i].rt;
      sumCT += results[i].ct;
    }
    var html = '<div class="averages-row">';
    html += '<div class="avg-card"><div class="avg-label">Avg Turnaround</div><div class="avg-value">' + (sumTAT / n).toFixed(2) + '</div></div>';
    html += '<div class="avg-card"><div class="avg-label">Avg Waiting</div><div class="avg-value">' + (sumWT / n).toFixed(2) + '</div></div>';
    html += '<div class="avg-card"><div class="avg-label">Avg Response</div><div class="avg-value">' + (sumRT / n).toFixed(2) + '</div></div>';
    html += '<div class="avg-card"><div class="avg-label">Throughput</div><div class="avg-value">' + (n / (Math.max.apply(null, results.map(function(r) { return r.ct; })) || 1)).toFixed(2) + '</div></div>';
    html += '</div>';
    return html;
  }

  function renderAlgorithmResult(algo, result, processColorMapByPid, processColorMapByLabel) {
    var maxTime = 0;
    for (var c = 0; c < result.timeline.length; c++) {
      for (var b = 0; b < result.timeline[c].length; b++) {
        if (result.timeline[c][b].end > maxTime) maxTime = result.timeline[c][b].end;
      }
    }

    var html = '<div class="result-panel">';
    html += '<h2 class="result-title">' + ALGO_NAMES[algo] + '</h2>';

    // Gantt Chart
    html += '<div class="result-section"><h3>Gantt Chart</h3>';
    html += renderGanttChart(result.timeline, processColorMapByPid, maxTime);
    html += '</div>';

    // Results Table
    html += '<div class="result-section"><h3>Process Results</h3>';
    html += renderResultsTable(result.results, processColorMapByLabel);
    html += '</div>';

    // Averages
    html += renderAverages(result.results);

    html += '</div>';
    return html;
  }

  // ===== UI HELPERS =====

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showError(msg) {
    document.getElementById('output').innerHTML = '<div class="error-message"><strong>Error:</strong> ' + escapeHTML(msg) + '</div>';
  }

  // ===== PROCESS TABLE =====
  var processCounter = 0;

  function addProcessRow(label, arrival, burst, priority) {
    processCounter++;
    var tbody = document.getElementById('process-tbody');
    var tr = document.createElement('tr');
    tr.setAttribute('data-pid', processCounter);
    tr.innerHTML =
      '<td><input type="text" value="' + escapeHTML(label || ('P' + processCounter)) + '" maxlength="5" placeholder="P' + processCounter + '"></td>' +
      '<td><input type="number" value="' + (arrival != null ? arrival : 0) + '" min="0" step="1" placeholder="0"></td>' +
      '<td><input type="number" value="' + (burst != null ? burst : 1) + '" min="1" step="1" placeholder="1"></td>' +
      '<td class="priority-col"><input type="number" value="' + (priority != null ? priority : 0) + '" min="0" step="1" placeholder="0"></td>' +
      '<td class="action-col"><button type="button" class="remove-process-btn" title="Remove">✕</button></td>';
    tbody.appendChild(tr);

    tr.querySelector('.remove-process-btn').addEventListener('click', function() {
      if (tbody.children.length > 1) tr.remove();
    });
  }

  function readProcesses() {
    var rows = document.getElementById('process-tbody').querySelectorAll('tr');
    var processes = [];
    for (var i = 0; i < rows.length; i++) {
      var inputs = rows[i].querySelectorAll('input');
      var label = inputs[0].value.trim() || ('P' + (i + 1));
      var arrival = parseInt(inputs[1].value);
      var burst = parseInt(inputs[2].value);
      var priority = parseInt(inputs[3].value) || 0;

      inputs[0].classList.remove('input-error');
      inputs[1].classList.remove('input-error');
      inputs[2].classList.remove('input-error');

      if (isNaN(arrival) || arrival < 0) {
        inputs[1].classList.add('input-error');
        throw new Error('Invalid arrival time for ' + label);
      }
      if (isNaN(burst) || burst < 1) {
        inputs[2].classList.add('input-error');
        throw new Error('Invalid burst time for ' + label);
      }

      processes.push({ index: i, label: label, arrival: arrival, burst: burst, priority: priority });
    }
    return processes;
  }

  function randomProcesses() {
    var tbody = document.getElementById('process-tbody');
    tbody.innerHTML = '';
    processCounter = 0;
    var count = 3 + Math.floor(Math.random() * 4); // 3-6
    for (var i = 0; i < count; i++) {
      addProcessRow('P' + (i + 1), Math.floor(Math.random() * 8), 1 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 5));
    }
  }

  // ===== ALGORITHM UI TOGGLE =====
  function updateAlgorithmUI() {
    var algo = document.getElementById('algorithm-select').value;
    var showPriority = algo === 'priority-np' || algo === 'priority-p';
    var showQuantum = algo === 'rr';

    document.getElementById('quantum-wrapper').style.display = showQuantum ? '' : 'none';

    var table = document.getElementById('process-table');
    if (showPriority) {
      table.classList.add('show-priority');
    } else {
      table.classList.remove('show-priority');
    }
  }

  // ===== THEME =====
  function initTheme() {
    var saved = localStorage.getItem('nc_sched_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }
  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('nc_sched_theme', next);
    updateThemeIcon(next);
  }
  function updateThemeIcon(theme) {
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ===== HISTORY =====
  var HISTORY_KEY = 'nc_sched_history';

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch(e) { return []; }
  }

  function saveHistory(entry) {
    var history = loadHistory();
    history.unshift(entry);
    if (history.length > 30) history.length = 30;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistoryPanel();
  }

  function renderHistoryPanel() {
    var list = document.getElementById('history-list');
    var history = loadHistory();
    if (history.length === 0) {
      list.innerHTML = '<p class="history-empty">No simulations yet</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      html += '<div class="history-item" data-index="' + i + '">' +
        '<div class="history-meta">' +
        '<span class="history-method">' + escapeHTML(h.algorithm) + '</span>' +
        '<span class="history-size">' + h.processCount + 'P / ' + h.cores + 'C</span>' +
        '<span class="history-date">' + new Date(h.date).toLocaleDateString() + '</span>' +
        '</div>' +
        '<div class="history-preview">' + escapeHTML(h.processLabels.join(', ')) + '</div>' +
        '</div>';
    }
    list.innerHTML = html;

    list.addEventListener('click', function(e) {
      var item = e.target.closest('.history-item');
      if (!item) return;
      var idx = parseInt(item.getAttribute('data-index'));
      if (!isNaN(idx) && history[idx]) {
        loadFromHistory(history[idx]);
        document.getElementById('history-panel').classList.remove('open');
      }
    });
  }

  function loadFromHistory(h) {
    document.getElementById('algorithm-select').value = h.algorithmKey || 'fcfs';
    document.getElementById('cores-input').value = h.cores || 1;
    if (h.quantum) document.getElementById('quantum-input').value = h.quantum;
    updateAlgorithmUI();

    var tbody = document.getElementById('process-tbody');
    tbody.innerHTML = '';
    processCounter = 0;
    for (var i = 0; i < h.processes.length; i++) {
      var p = h.processes[i];
      addProcessRow(p.label, p.arrival, p.burst, p.priority);
    }
  }

  // ===== URL SHARING =====
  function encodeToURL(algo, processes, cores, quantum) {
    var params = new URLSearchParams();
    params.set('algo', algo);
    params.set('cores', cores);
    if (algo === 'rr') params.set('q', quantum);
    var labels = [], arrivals = [], bursts = [], priorities = [];
    for (var i = 0; i < processes.length; i++) {
      labels.push(processes[i].label);
      arrivals.push(processes[i].arrival);
      bursts.push(processes[i].burst);
      priorities.push(processes[i].priority);
    }
    params.set('l', labels.join(','));
    params.set('a', arrivals.join(','));
    params.set('b', bursts.join(','));
    params.set('p', priorities.join(','));
    return window.location.origin + window.location.pathname + '?' + params.toString();
  }

  function decodeFromURL() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has('algo') || !params.has('l')) return null;
    var algo = params.get('algo');
    var cores = parseInt(params.get('cores')) || 1;
    var quantum = parseInt(params.get('q')) || 2;
    var labels = params.get('l').split(',');
    var arrivals = (params.get('a') || '').split(',').map(Number);
    var bursts = (params.get('b') || '').split(',').map(Number);
    var priorities = (params.get('p') || '').split(',').map(Number);
    var n = labels.length;
    if (arrivals.length !== n || bursts.length !== n) return null;

    var processes = [];
    for (var i = 0; i < n; i++) {
      processes.push({ label: labels[i], arrival: arrivals[i] || 0, burst: bursts[i] || 1, priority: priorities[i] || 0 });
    }
    return { algo: algo, cores: cores, quantum: quantum, processes: processes };
  }

  // ===== MAIN CALCULATION =====
  function calculate() {
    document.querySelectorAll('.input-error').forEach(function(el) { el.classList.remove('input-error'); });

    var processes;
    try { processes = readProcesses(); }
    catch (err) { showError(err.message); return; }

    if (processes.length === 0) { showError('Add at least one process'); return; }

    var algo = document.getElementById('algorithm-select').value;
    var numCores = Math.max(1, parseInt(document.getElementById('cores-input').value) || 1);
    var quantum = Math.max(1, parseInt(document.getElementById('quantum-input').value) || 2);
    var compareMode = document.getElementById('compare-toggle').checked;
    var compareAlgo = document.getElementById('compare-select').value;

    var algos = [algo];
    if (compareMode && compareAlgo !== algo) algos.push(compareAlgo);

    // Build color maps
    var processColorMapByPid = {};
    var processColorMapByLabel = {};
    for (var i = 0; i < processes.length; i++) {
      var colorClass = PROCESS_COLORS[i % PROCESS_COLORS.length];
      processColorMapByPid[processes[i].index] = colorClass;
      processColorMapByLabel[processes[i].label] = colorClass;
    }

    var output = document.getElementById('output');
    var html = '';
    var wrapCompare = compareMode && algos.length === 2;
    if (wrapCompare) html += '<div class="compare-wrapper">';

    for (var ai = 0; ai < algos.length; ai++) {
      try {
        var result = runAlgorithm(algos[ai], processes, numCores, quantum);
        html += renderAlgorithmResult(algos[ai], result, processColorMapByPid, processColorMapByLabel);
      } catch (err) {
        html += '<div class="error-message"><strong>' + ALGO_NAMES[algos[ai]] + ':</strong> ' + escapeHTML(err.message) + '</div>';
      }
    }

    if (wrapCompare) html += '</div>';

    // Share section
    var shareURL = encodeToURL(algo, processes, numCores, quantum);
    html += '<div class="share-section">';
    html += '<button class="btn btn-small" id="share-btn">Share Link</button>';
    html += '<button class="btn btn-small" id="print-btn">🖨 Print</button>';
    html += '<input type="text" class="share-url" id="share-url" value="' + escapeHTML(shareURL) + '" readonly>';
    html += '</div>';

    output.innerHTML = html;

    document.getElementById('share-btn').addEventListener('click', function() {
      var urlInput = document.getElementById('share-url');
      navigator.clipboard.writeText(urlInput.value).then(function() {
        var btn = document.getElementById('share-btn');
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Share Link'; }, 1500);
      }).catch(function() { document.getElementById('share-url').select(); });
    });

    document.getElementById('print-btn').addEventListener('click', function() { window.print(); });

    // Save to history
    saveHistory({
      date: Date.now(),
      algorithm: ALGO_NAMES[algo],
      algorithmKey: algo,
      cores: numCores,
      quantum: quantum,
      processCount: processes.length,
      processLabels: processes.map(function(p) { return p.label; }),
      processes: processes.map(function(p) { return { label: p.label, arrival: p.arrival, burst: p.burst, priority: p.priority }; })
    });
    renderHistoryPanel();
  }

  // ===== INITIALIZATION =====
  function init() {
    initTheme();

    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('algorithm-select').addEventListener('change', updateAlgorithmUI);
    document.getElementById('compare-toggle').addEventListener('change', function() {
      document.getElementById('compare-method-wrapper').style.display =
        document.getElementById('compare-toggle').checked ? 'inline-block' : 'none';
    });

    document.getElementById('add-process-btn').addEventListener('click', function() { addProcessRow(); });
    document.getElementById('random-btn').addEventListener('click', randomProcesses);
    document.getElementById('calculate-btn').addEventListener('click', calculate);
    document.getElementById('clear-btn').addEventListener('click', function() {
      document.getElementById('output').innerHTML = '';
    });

    document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
    document.getElementById('history-toggle-btn').addEventListener('click', function() {
      document.getElementById('history-panel').classList.toggle('open');
    });

    // Default processes
    var urlData = decodeFromURL();
    if (urlData) {
      document.getElementById('algorithm-select').value = urlData.algo;
      document.getElementById('cores-input').value = urlData.cores;
      document.getElementById('quantum-input').value = urlData.quantum;
      updateAlgorithmUI();
      for (var i = 0; i < urlData.processes.length; i++) {
        var p = urlData.processes[i];
        addProcessRow(p.label, p.arrival, p.burst, p.priority);
      }
      setTimeout(calculate, 100);
    } else {
      addProcessRow('P1', 0, 5, 2);
      addProcessRow('P2', 1, 3, 1);
      addProcessRow('P3', 2, 8, 3);
      addProcessRow('P4', 3, 6, 4);
      updateAlgorithmUI();
    }

    renderHistoryPanel();

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.ctrlKey) calculate();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
