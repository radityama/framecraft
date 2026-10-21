import React from 'react';
import {createRoot} from 'react-dom/client';
import {Studio} from './Studio';
import './studio.css';

createRoot(document.getElementById('video-container')!).render(<Studio />);
