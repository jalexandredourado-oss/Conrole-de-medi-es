import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { testConnection } from './services/firebase';

testConnection().catch(() => {});

function mount() {
  let container = document.getElementById('root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
  }
  const root = createRoot(container);
  root.render(<App />);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}


