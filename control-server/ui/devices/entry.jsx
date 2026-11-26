import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Page from './Page.jsx';
import { start } from './controller.jsx';

flushSync(() => createRoot(document.getElementById('root')).render(<Page />));
start();
