import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import RootApp from './app/RootApp.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const installSafePerformanceMeasure = () => {
  const perf = window.performance;
  if (!perf || typeof perf.measure !== 'function' || perf.__rendaSafeMeasureInstalled) {
    return;
  }

  const originalMeasure = perf.measure.bind(perf);

  perf.measure = (...args) => {
    try {
      return originalMeasure(...args);
    } catch (error) {
      const isCloneFailure = error?.name === 'DataCloneError'
        || error?.message?.includes('Data cannot be cloned');

      if (!isCloneFailure) {
        throw error;
      }

      try {
        const [name] = args;
        if (typeof name === 'string') {
          return originalMeasure(name);
        }
      } catch {
        // Ignore fallback errors and drop this measurement.
      }

      return undefined;
    }
  };

  perf.__rendaSafeMeasureInstalled = true;
};

const sendRendererLog = (level, message, details = null) => {
  try {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('renderer-log', { level, message, details });
  } catch {
    // Ignore if Electron IPC is unavailable.
  }
};

const getRendererRuntimeSnapshot = () => {
  const memory = performance?.memory
    ? {
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        usedJSHeapSize: performance.memory.usedJSHeapSize,
      }
    : null;

  return {
    href: window.location.href,
    visibilityState: document.visibilityState,
    readyState: document.readyState,
    hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
    memory,
  };
};

const installConsoleLogging = () => {
  const originalConsoleError = console.error.bind(console);

  console.error = (...args) => {
    try {
      const [firstArg, ...restArgs] = args;
      const normalizedMessage = typeof firstArg === 'string' ? firstArg : String(firstArg);

      if (
        normalizedMessage.includes('Maximum update depth exceeded')
        || normalizedMessage.includes('Too many re-renders')
      ) {
        sendRendererLog('ERROR', 'Renderer React console error', {
          message: normalizedMessage,
          args: restArgs.map((arg) => {
            if (arg instanceof Error) {
              return {
                name: arg.name,
                message: arg.message,
                stack: arg.stack,
              };
            }
            if (typeof arg === 'string') {
              return arg;
            }
            try {
              return JSON.parse(JSON.stringify(arg));
            } catch {
              return String(arg);
            }
          }),
          stack: new Error('Console error stack').stack,
          runtime: getRendererRuntimeSnapshot(),
        });
      }
    } catch {
      // Ignore logging failures.
    }

    originalConsoleError(...args);
  };
};

const installRendererLifecycleLogging = () => {
  window.addEventListener('DOMContentLoaded', () => {
    sendRendererLog('INFO', 'Renderer DOMContentLoaded', getRendererRuntimeSnapshot());
  });

  window.addEventListener('load', () => {
    sendRendererLog('INFO', 'Renderer window load', getRendererRuntimeSnapshot());
  });

  window.addEventListener('beforeunload', () => {
    sendRendererLog('WARN', 'Renderer beforeunload', getRendererRuntimeSnapshot());
  });

  window.addEventListener('pagehide', () => {
    sendRendererLog('WARN', 'Renderer pagehide', getRendererRuntimeSnapshot());
  });

  document.addEventListener('visibilitychange', () => {
    sendRendererLog('INFO', 'Renderer visibility changed', getRendererRuntimeSnapshot());
  });

  window.addEventListener('online', () => {
    sendRendererLog('INFO', 'Renderer online event', getRendererRuntimeSnapshot());
  });

  window.addEventListener('offline', () => {
    sendRendererLog('WARN', 'Renderer offline event', getRendererRuntimeSnapshot());
  });

  window.setInterval(() => {
    sendRendererLog('INFO', 'Renderer heartbeat', getRendererRuntimeSnapshot());
  }, 30000);
};

window.addEventListener('error', (event) => {
  sendRendererLog('ERROR', 'Renderer window error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error ? {
      name: event.error.name,
      message: event.error.message,
      stack: event.error.stack,
    } : null,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error
    ? {
        name: event.reason.name,
        message: event.reason.message,
        stack: event.reason.stack,
      }
    : event.reason;

  sendRendererLog('ERROR', 'Renderer unhandled promise rejection', reason);
});

sendRendererLog('INFO', 'Renderer bootstrap started');
installSafePerformanceMeasure();
installConsoleLogging();
installRendererLifecycleLogging();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
)
