---
name: feedback-git-push
description: Fix for "send-pack: unexpected disconnect" on large initial pushes to GitHub
metadata:
  type: feedback
---

Run `git config http.postBuffer 524288000` before pushing when hitting:
```
send-pack: unexpected disconnect while reading sideband packet
fatal: the remote end hung up unexpectedly
```

**Why:** Default HTTP buffer is too small for large initial repo pushes. 500 MB covers this project.

**How to apply:** When a push to an empty GitHub remote fails with the disconnect error, set the postBuffer and retry. This is a one-time fix per repo clone.
