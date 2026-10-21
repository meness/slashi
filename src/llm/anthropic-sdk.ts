// Bundled on its own as dist/anthropic-sdk.js and loaded on first use: the SDK is most of the extension's size,
// and only people who call Claude with an API key need it.
export { default } from '@anthropic-ai/sdk';
