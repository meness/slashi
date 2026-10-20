#!/usr/bin/env bash
# Claude Code hooks for this repo. Usage: guard.sh pre|post|stop  (hook JSON on stdin)
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
rel=${file#"$PWD"/}

case "$1" in
  pre)
    case "$rel" in
      dist/*|marketplace/index.json|package-lock.json|*.vsix)
        echo "$rel is generated. Edit the source and run the generator (see CLAUDE.md)." >&2; exit 2 ;;
    esac ;;
  post)
    if [[ "$rel" == src/core/*.ts ]] && grep -qE "from ['\"]vscode['\"]|require\(['\"]vscode['\"]\)" "$file"; then
      echo "$rel imports vscode, but src/core must stay pure (CONTRIBUTING.md). Move that code out of src/core." >&2; exit 2
    fi
    # Keep edited files formatted; Prettier skips ignored and unknown files.
    [[ -f "$file" ]] && npx --no -- prettier --write --ignore-unknown --log-level=silent "$file" ;;
  stop)
    # Don't loop: if we already blocked once this turn, let Claude stop.
    [[ $(jq -r '.stop_hook_active' <<<"$input") == true ]] && exit 0
    [[ -z $(git status --porcelain -- src test schemas marketplace) ]] && exit 0
    if ! out=$(npm run -s typecheck 2>&1 && npm run -s lint 2>&1 && npm test -s 2>&1); then
      echo "Typecheck/lint/tests failed:" >&2; tail -40 <<<"$out" >&2; exit 2
    fi ;;
esac
exit 0
