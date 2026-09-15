import { createRoot } from 'react-dom/client';
import '../../../webview/components/base.css';
import { App } from './App';
import './prompts.css';

createRoot(document.getElementById('root')!).render(<App />);
