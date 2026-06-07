Output docs/first-run-setup.gif

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 720
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

# Use an isolated HOME so the first-run wizard always appears.
# NOTE: this demo types the provided 9router endpoint key into the password prompt.
Type "codemap"
Enter
Sleep 2s

# Step 1: choose provider — 9router is the default recommended option.
Enter
Sleep 4s

# Step 3: API key.
Type "sk-d6874aeeb6f40332-u0wm74-cc8459c3"
Enter
Sleep 4s

# Step 4: choose models for build, plan, and fast modes.
# The wizard fetches available models from 9router. Use the current/default item.
Down
Sleep 300ms
Enter
Sleep 2s
Enter
Sleep 2s
Down
Sleep 300ms
Down
Sleep 300ms
Enter
Sleep 2s

# Step 5: save config globally inside the temporary HOME.
Enter
Sleep 1s


# Step 6: confirm summary.
Enter
Sleep 5s

# Step 7: Login or not
Down
Sleep 300ms
Enter
Sleep 5s

# Step 8: Test chat 
Type "Xin chào"
Enter
Sleep 15s