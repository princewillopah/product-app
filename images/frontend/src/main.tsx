import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// A single QueryClient drives the whole app. Because every page reads the same
// query keys (['products'], ['orders']), the Dashboard count and the list pages
// are physically the same cached data — they cannot disagree.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      refetchInterval: 15_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: '12px',
            background: '#0f172a',
            color: '#f1f5f9',
            fontSize: '14px',
            fontWeight: 500,
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
