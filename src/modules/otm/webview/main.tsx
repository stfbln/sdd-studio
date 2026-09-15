import { createRoot } from 'react-dom/client';
import '../../../webview/components/base.css';
import '../../../webview/structured/structured.css';
import { App } from './App';
import './otm.css';

createRoot(document.getElementById('root')!).render(<App />);
