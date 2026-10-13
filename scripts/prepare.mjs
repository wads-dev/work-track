import { patchFirestoreLocalIndex } from './patch-firestore-local-index.mjs';

// Native cache queries need the pinned cursor fix in EVERY install, including
// frontend production builds and HUSKY=0. Only Git hooks are optional.
console.log('Firestore local-index patch:', await patchFirestoreLocalIndex());

// Cloud Build installs production dependencies without Husky or a Git checkout.
if (process.env.NODE_ENV !== 'production' && process.env.HUSKY !== '0') {
  const { existsSync } = await import('node:fs');
  if (existsSync('.git')) {
    const { default: husky } = await import('husky');
    husky();
  }
}
