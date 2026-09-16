import { createRoot } from 'react-dom/client';
import '../../../webview/components/base.css';
import { App } from './App';
import './studio.css';

createRoot(document.getElementById('root')!).render(<App />);
