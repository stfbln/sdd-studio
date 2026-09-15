import { createRoot } from 'react-dom/client';
import '../components/base.css';
import { CatalogApp } from './CatalogApp';
import './catalog.css';

createRoot(document.getElementById('root')!).render(<CatalogApp />);
