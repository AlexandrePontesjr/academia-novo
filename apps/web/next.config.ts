import type { NextConfig } from 'next';

const config: NextConfig = {
  // os pacotes do workspace são código-fonte TypeScript
  transpilePackages: ['@academia/contracts', '@academia/ui'],
};

export default config;
