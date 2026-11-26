# AI features

Trellis can use AI to write commit messages, explain commits and help with conflicts. It's **off** until you turn it on, and you use your own account with an AI service, so nothing is sent anywhere unless you set it up.

## Turning it on

Open **Settings → AI** (or **AI settings…** in the command palette), tick **Turn on AI features**, and choose a **Service**:

- **Anthropic** (Claude): paste an API key from the [Anthropic Console](https://console.anthropic.com).
- **OpenAI-compatible**: OpenAI, OpenRouter, or a model running on your own computer with Ollama or LM Studio. Enter the service's **API address** and the **Model** name.

Your key is stored encrypted with your operating system's keychain.

## What it can do

Nothing is sent until you click one of these:

| Where                     | Button              | What it does                                                     |
| ------------------------- | ------------------- | ---------------------------------------------------------------- |
| Commit box (Changes view) | **Suggest**         | Writes a commit message from your staged changes.                |
| Right-click a commit      | **Explain with AI** | Explains what the commit does.                                   |
| Conflict editor           | **Ask AI**          | Explains the conflict and suggests a resolved version to review. |

The changes involved are sent to the service you chose. AI can be wrong, so check what it suggests before using it.

To turn AI off again, untick **Turn on AI features**. All AI buttons disappear.
