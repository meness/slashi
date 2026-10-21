// Help, feedback and support links. Studio opens them by key only, so a webview can't open an arbitrary URL.

const REPO = 'https://github.com/meness/slashi';

export const HELP_LINKS = {
  docs: `${REPO}#readme`,
  packs: `${REPO}/blob/main/docs/BUILDING_ACTIONS.md`,
  api: `${REPO}/blob/main/docs/BUILDING_ACTIONS.md#extension-api`,
  bug: `${REPO}/issues/new?template=bug_report.yml`,
  idea: `${REPO}/issues/new?template=feature_request.yml`,
  issues: `${REPO}/issues/new/choose`,
  changelog: `${REPO}/releases`,
  source: REPO,
  security: `${REPO}/blob/main/SECURITY.md`,
  rate: 'https://marketplace.visualstudio.com/items?itemName=meness.slashi&ssr=false#review-details',
  openVsx: 'https://open-vsx.org/extension/meness/slashi',
  donate: `${REPO}/blob/main/DONATE.md`,
} as const;

export type HelpLink = keyof typeof HELP_LINKS;
