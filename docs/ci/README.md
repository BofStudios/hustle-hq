# CI (GitHub Actions)

`github-actions-test.yml` runs `npm test` on Ubuntu and Windows (Node 24) on every push.

To enable it, the GitHub CLI token needs the `workflow` scope (one-time, opens the browser):

```bash
gh auth refresh -h github.com -s workflow
mkdir -p .github/workflows && git mv docs/ci/github-actions-test.yml .github/workflows/test.yml
git commit -m "Enable CI" && git push
```
