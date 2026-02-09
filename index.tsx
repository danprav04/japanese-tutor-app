// Polyfills must be first!
import './src/utils/polyfills';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
