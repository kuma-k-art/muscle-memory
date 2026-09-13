// Development opt-in: URL/session, or an explicit debug-only flag for PWA cold starts.
// Never reads or modifies workout localStorage data.
(() => {
  let enabled = new URLSearchParams(location.search).get('startupTrace') === '1';
  try { enabled ||= sessionStorage.getItem('mmStartupTrace') === '1'; } catch (_) {}
  try { enabled ||= localStorage.getItem('mm_startup_trace') === '1'; } catch (_) {}
  window.mmStartupEnabled = enabled;
  window.mmPerfStats = {};
  window.mmPerfSample = (name, ms) => {
    if (!enabled) return;
    const stat = window.mmPerfStats[name] ||= {count:0,totalMs:0,maxMs:0};
    stat.count++; stat.totalMs += ms; stat.maxMs = Math.max(stat.maxMs,ms);
    if (stat.count === 1) performance.measure(name, {start: Math.max(0,performance.now()-ms), duration:ms});
  };
  const seen = new Set();
  let queued = false;
  const mark = (name, options) => {
    if (!enabled || seen.has(name)) return;
    seen.add(name);
    performance.mark(name, options);
  };
  const duration = (name, start, end) => performance.measure(name, start, end).duration;
  window.mmStartupMark = name => {
    mark(name);
    if (!enabled) return;
    if (name === 'mm:first-frame') mark('home-rendered');
    if (seen.has('mm:recent-decoded') && seen.has('mm:routines-data-ready')) mark('storage-loaded');
    if (!queued && seen.has('mm:home-ready') && seen.has('mm:routines-ready')) {
      queued = true;
      // Give Flutter's submitted frame a paint opportunity and yield to input.
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
        mark('app-interactive');
        const result = {
          Storage: duration('Storage', 'mm:preferences-start', 'storage-loaded'),
          'Home Render': duration('Home Render', 'app-start', 'home-rendered'),
          Interactive: duration('Interactive', 'home-rendered', 'app-interactive'),
          Total: duration('Total', 'page-load-start', 'app-interactive'),
        };
        window.mmStartupResult = result;
        for (const [name, start, end] of [
          ['Routines', 'mm:routines-data-start', 'mm:routines-data-ready'],
          ['Recent history decode', 'mm:recent-decode-start', 'mm:recent-decoded'],
          ['Preferences read', 'mm:preferences-start', 'mm:preferences-ready'],
          ['Bootstrap to Dart (fetch + compile + engine)', 'app-start', 'mm:dart-main'],
        ]) if (seen.has(start) && seen.has(end)) duration(name, start, end);
        console.info('[PERF]\n' + Object.entries(result).map(([key, ms]) => `${key}: ${ms.toFixed(1)} ms`).join('\n'));
      }, 0)));
    }
  };
  mark('page-load-start', { startTime: 0 });
  mark('app-start');
  if (enabled && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => mark('dom-content-loaded'), {once:true});
  }
})();
