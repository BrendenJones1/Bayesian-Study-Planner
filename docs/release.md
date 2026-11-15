# Releasing the extension

Owner steps for a release (v0.1.0 was the MVP; v0.1.1 fixes the Canvas loader). `release.yml` does the build and the zip; the agent never tags.

1. Merge the release PR into `main`.
2. Tag and push:
   ```
   git checkout main && git pull
   git tag v0.1.1 && git push origin v0.1.1
   ```
   This runs `release.yml`, which tests, builds `extension/dist` and attaches
   `bayesian-study-planner-v0.1.1.zip` to a GitHub release.
3. Download the zip from the release page and unzip it.
4. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the unzipped folder.

The zip carries the bundled `cpts.json` tables, so it works offline on first install.
Keep `extension/package.json` and `extension/public/manifest.json` versions equal to the tag (a test checks they match each other).
