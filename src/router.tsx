import { createHashRouter } from 'react-router';

import { Layout } from './components/Layout';
import Add from './screens/Add';
import Outfits from './screens/Outfits';
import Randomizer from './screens/Randomizer';
import Wardrobe from './screens/Wardrobe';

/**
 * Hash router (spec §9): a standalone iOS launch and the service worker's
 * navigate fallback must never disagree about the current path, and a hash
 * route can't produce a server 404 either way.
 */
export const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Randomizer /> },
      { path: 'wardrobe', element: <Wardrobe /> },
      { path: 'outfits', element: <Outfits /> },
      { path: 'add', element: <Add /> },
    ],
  },
]);
