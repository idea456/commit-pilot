# 🤖💬 commit-pilot

This package uses ChatGPT to generate commit messages based on your changes. It provides a convenient way to generate commit messages for your development workflow, if you are too lazy to think of a good commit message to put in.

```
npm install --save-dev commit-pilot
```

## Usage

After installing, set up a custom script in `package.json` to run `commit-pilot` before commiting:

```json
{
    ...
    "scripts": {
        "commit": "npx commit-pilot"
    },
    ...
}
```

and then before commiting, run:

```bash
npm run commit
```

Or simply set it up in a pre-commit hook workflow with `husky` in the `pre-commit` file:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx commit-pilot --skip-commit
```

Be sure to pass in `--skip-commit`, otherwise `commit-pilot` will attempt to commit the message by itself instead of passing it to `git`

## Next features

-   Add option to include gitignore to ignore changes from certain files
-   Generate commit messages for even larger changes, currently ChatGPT limits word count for large charges
