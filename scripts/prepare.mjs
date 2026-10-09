// Cloud Build installs production dependencies without Husky or a Git checkout.
if (process.env.NODE_ENV !== 'production' && process.env.HUSKY !== '0') {
  const { existsSync } = await import('node:fs');
  if (existsSync('.git')) {
    const { default: husky } = await import('husky');
    husky();
  }
}
