module.exports = {
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-essentials', '@storybook/addon-interactions'],
  framework: '@storybook/vue3',
  core: {
    builder: '@storybook/builder-vite'
  },
  /**
   * Extend Vite config
   * @param {import('vite').UserConfig} config
   * @param {'DEVELOPMENT'|'PRODUCTION'} [configType]
   * @returns {Promise<*>}
   */
  async viteFinal(config, { configType }) {
    config.optimizeDeps = configType === 'PRODUCTION' ? config.optimizeDeps : {
      ...(config.optimizeDeps || {}),
      include: [
        ...(config?.optimizeDeps?.include || []),
        // Fix: `@storybook/addon-interactions` exports is not defined or `jest-mock` does not provide an export named 'fn'
        'jest-mock',
        // Optional, but prevents error flashing in the Storybook component preview iframe:
        // Fix: failed to fetch dynamically import module, avoid cache miss for dependencies on the first load 
        '@storybook/components',
        '@storybook/store',
        // Add all addons that imported in the `preview.js` or `preview.ts` file and used in exported constants
        '@storybook/addon-links',
        '@storybook/addon-essentials',
      ],
    }
    return config
  }
}
