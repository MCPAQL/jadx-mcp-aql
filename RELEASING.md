<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Releasing

Repository naming and creation are maintainer decisions. Do not create a remote
repository, publish a package, or push a release tag as part of a local build.
After a name is approved, update package repository metadata and verification
examples to the chosen `MCPAQL/REPOSITORY` before the first release.

## Use a fresh single-branch clone

The development checkout contains `refs/local/prototype`, reflog entries and
unreachable objects holding private history. Publishing must start from a fresh
single-branch clone of `main`, never from that checkout. Disable Git's local-copy
optimization so extra refs and unreachable objects cannot be carried over:

```sh
git clone --no-local --single-branch --branch main \
  /path/to/development-checkout /path/to/public-checkout
cd /path/to/public-checkout
git for-each-ref --format='%(refname)'  # inspect the complete ref list
git log main                        # inspect the public history
# Only after remote creation is approved:
git remote remove origin
git remote add origin git@github.com:MCPAQL/REPOSITORY.git
git push -u origin main
```

Never publish this development repository with `git push --mirror`. Do not
copy its `.git` directory, refs, reflog or object database into the public clone.
Do not use `--all` as a substitute for inspecting and pushing `main` explicitly.
Local-only snapshots are not release inputs.

## Before the first tag

- Confirm ownership of the npm scope/package and the approved repository name.
- Confirm first-publish authentication and trusted-publisher configuration against
  current npm documentation. The workflow assumes an existing, configured trusted
  publisher; it is not a bootstrap procedure for a new npm package.
- Configure the GitHub `release` environment and its maintainer approvals.
- Run CI in the approved repository and verify the Linux network-denied tests
  and reproducible-build checks before creating any `v*` tag. Local workflow
  validation does not establish that the remote workflow has run successfully.
- Confirm that the tag version equals `packages/jadx-aql/package.json`.

The release workflow builds/tests with read-only permissions, then passes hashed
artifacts to a separate publishing job. Only that job receives release/OIDC/
attestation write permissions. It verifies the checksums before attesting and
publishing the exact npm tarball. The runner drops back to the normal build user
inside the Linux network namespace so test outputs are not root-owned.

## Local verification

```sh
source .tools/env.sh
npm ci --ignore-scripts
npm run build
.tools/gradle-8.14.3/bin/gradle build :rea-compat:testClasspath
npm test
bash scripts/test-no-network.sh
python3 scripts/reproducible-build.py
python3 scripts/reproducible-npm.py
```

Refresh `docs/artifact.sha256` and the validation reports after rebuilding.
Keep upstream legal text and `META-INF/NOTICE` intact. Verify downloaded release
hashes and provenance as described in the README's "Verify this build" section.
